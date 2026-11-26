"""HireLens AI service (FastAPI)."""

from __future__ import annotations

import secrets
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import router
from app.config import Settings, get_settings
from app.engine import Engine, build_engine
from app.llm.base import LLMProvider
from app.logging_config import configure_logging
from app.schemas import HealthResponse

VERSION = "1.0.0"
log = structlog.get_logger("hirelens.ai")
_PUBLIC_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


def create_app(settings: Settings | None = None, *, llm: LLMProvider | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, json=settings.env != "development")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine: Engine = app.state.engine
        for coll in (settings.qdrant_resume_collection, settings.qdrant_job_collection):
            try:
                engine.store.ensure_collection(coll)
            except Exception as exc:  # Qdrant may still be starting; collections are created lazily.
                log.warning("qdrant_init_deferred", collection=coll, error=str(exc))
        log.info(
            "ai_service_started",
            llm=engine.llm.name,
            embedder=engine.embedder.name,
            ner=engine.ner.name,
            vector_store=engine.store.location,
        )
        yield

    app = FastAPI(
        title="HireLens AI Service",
        version=VERSION,
        description="Internal service-to-service API used by the HireLens NestJS backend. All /v1 routes "
        "require the `X-Service-Token` header.",
        lifespan=lifespan,
    )
    app.state.engine = build_engine(settings, llm=llm)

    @app.middleware("http")
    async def context_and_auth(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.perf_counter()
        if request.url.path not in _PUBLIC_PATHS and not secrets.compare_digest(
            request.headers.get("x-service-token", ""), settings.service_token
        ):
            response: Response = JSONResponse(
                {"error": "unauthorized", "message": "Invalid service token"},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        else:
            response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        response.headers["x-request-id"] = request_id
        response.headers["x-response-time-ms"] = str(duration_ms)
        if request.url.path != "/health":
            log.info(
                "request",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration_ms=duration_ms,
            )
        structlog.contextvars.clear_contextvars()
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"error": "http_error", "message": exc.detail}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            {"error": "validation_error", "message": "Invalid request", "details": jsonable_errors(exc)},
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", error=str(exc))
        return JSONResponse({"error": "internal_error", "message": "Internal server error"}, status_code=500)

    @app.get("/health", response_model=HealthResponse, tags=["health"])
    async def health() -> HealthResponse:
        engine: Engine = app.state.engine
        ok = engine.store.healthy()
        return HealthResponse(
            status="ok" if ok else "degraded",
            llm_provider=engine.llm.name,
            embedding_provider=engine.embedder.name,
            ner_provider=engine.ner.name,
            vector_store=engine.store.location,
            version=VERSION,
        )

    app.include_router(router)
    return app


def jsonable_errors(exc: RequestValidationError) -> list[dict[str, object]]:
    return [{"loc": list(e.get("loc", ())), "msg": e.get("msg", ""), "type": e.get("type", "")} for e in exc.errors()]


app = create_app()
