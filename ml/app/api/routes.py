from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.engine import Engine
from app.nlp.text_extraction import UnsupportedFileError, detect_mime, extract_text
from app.schemas import (
    AnalyzeJobRequest,
    AnalyzeJobResponse,
    DeleteResponse,
    FeedbackRequest,
    FeedbackResponse,
    IndexRequest,
    IndexResponse,
    InterviewRequest,
    InterviewResponse,
    MatchRequest,
    MatchResponse,
    ParseResumeResponse,
    ParseTextRequest,
    RedactRequest,
    RedactResponse,
    SimilarHit,
    SimilarResumesRequest,
    SimilarResumesResponse,
)
from app.services.feedback import generate_feedback
from app.services.interview import generate_questions
from app.services.job_analyzer import analyze_job
from app.services.redaction import redact
from app.services.resume_parser import parse_resume_text

router = APIRouter(prefix="/v1")


def get_engine(request: Request) -> Engine:
    engine: Engine = request.app.state.engine
    return engine


EngineDep = Annotated[Engine, Depends(get_engine)]


@router.post(
    "/resumes/parse",
    response_model=ParseResumeResponse,
    tags=["resumes"],
    summary="Parse an uploaded resume file (PDF/DOCX/TXT) into structured JSON",
)
async def parse_resume_file(engine: EngineDep, file: Annotated[UploadFile, File()]) -> ParseResumeResponse:
    data = await file.read(engine.settings.max_upload_bytes + 1)
    if len(data) > engine.settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds upload limit")
    try:
        mime = detect_mime(file.filename or "", file.content_type, data[:2048])
        text = await asyncio.to_thread(extract_text, data, mime)
    except UnsupportedFileError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return await asyncio.to_thread(parse_resume_text, text, engine.llm, engine.ner)


@router.post(
    "/resumes/parse-text",
    response_model=ParseResumeResponse,
    tags=["resumes"],
    summary="Parse raw resume text into structured JSON",
)
async def parse_resume_raw(engine: EngineDep, body: ParseTextRequest) -> ParseResumeResponse:
    return await asyncio.to_thread(parse_resume_text, body.text, engine.llm, engine.ner)


def _index(engine: Engine, collection: str, body: IndexRequest) -> IndexResponse:
    vector = engine.embedder.embed([body.text])[0]
    engine.store.upsert(collection, body.id, vector, dict(body.metadata))
    return IndexResponse(id=body.id, collection=collection, dim=len(vector), embedding_provider=engine.embedder.name)


@router.post("/resumes/index", response_model=IndexResponse, tags=["vectors"])
async def index_resume(engine: EngineDep, body: IndexRequest) -> IndexResponse:
    return await asyncio.to_thread(_index, engine, engine.settings.qdrant_resume_collection, body)


@router.delete("/resumes/{resume_id}", response_model=DeleteResponse, tags=["vectors"])
async def delete_resume_vector(engine: EngineDep, resume_id: str) -> DeleteResponse:
    await asyncio.to_thread(engine.store.delete, engine.settings.qdrant_resume_collection, resume_id)
    return DeleteResponse(id=resume_id, deleted=True)


@router.post(
    "/jobs/analyze",
    response_model=AnalyzeJobResponse,
    tags=["jobs"],
    summary="Extract required / nice-to-have skills, min years and seniority",
)
async def analyze(engine: EngineDep, body: AnalyzeJobRequest) -> AnalyzeJobResponse:
    return await asyncio.to_thread(analyze_job, body, engine.llm)


@router.post("/jobs/index", response_model=IndexResponse, tags=["vectors"])
async def index_job(engine: EngineDep, body: IndexRequest) -> IndexResponse:
    return await asyncio.to_thread(_index, engine, engine.settings.qdrant_job_collection, body)


@router.delete("/jobs/{job_id}", response_model=DeleteResponse, tags=["vectors"])
async def delete_job_vector(engine: EngineDep, job_id: str) -> DeleteResponse:
    await asyncio.to_thread(engine.store.delete, engine.settings.qdrant_job_collection, job_id)
    return DeleteResponse(id=job_id, deleted=True)


@router.post(
    "/jobs/similar-resumes",
    response_model=SimilarResumesResponse,
    tags=["vectors"],
    summary="Nearest resumes to an indexed job (vector search)",
)
async def similar_resumes(engine: EngineDep, body: SimilarResumesRequest) -> SimilarResumesResponse:
    vecs = await asyncio.to_thread(engine.store.get_vectors, engine.settings.qdrant_job_collection, [body.job_id])
    if body.job_id not in vecs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job is not indexed")
    hits = await asyncio.to_thread(
        engine.store.search, engine.settings.qdrant_resume_collection, vecs[body.job_id], body.limit
    )
    return SimilarResumesResponse(hits=[SimilarHit(id=i, score=round(s, 4)) for i, s in hits])


@router.post(
    "/match",
    response_model=MatchResponse,
    tags=["matching"],
    summary="Explainable match scores for candidates against a job",
)
async def match(engine: EngineDep, body: MatchRequest) -> MatchResponse:
    return await asyncio.to_thread(engine.matcher.match, body)


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    tags=["feedback"],
    summary="ATS score, missing keywords and bullet rewrites",
)
async def feedback(engine: EngineDep, body: FeedbackRequest) -> FeedbackResponse:
    return await asyncio.to_thread(generate_feedback, body, engine.llm)


@router.post("/interview-questions", response_model=InterviewResponse, tags=["interview"])
async def interview(engine: EngineDep, body: InterviewRequest) -> InterviewResponse:
    return await asyncio.to_thread(generate_questions, body, engine.llm)


@router.post(
    "/redact",
    response_model=RedactResponse,
    tags=["bias"],
    summary="Remove name, contact, gender and age signals for blind screening",
)
async def redact_text(body: RedactRequest) -> RedactResponse:
    text, removed = redact(body.text, body.name)
    return RedactResponse(redacted_text=text, removed=removed)
