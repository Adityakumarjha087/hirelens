"""Interview questions tailored to the candidate's resume and the job."""

from __future__ import annotations

from app.llm.base import LLMProvider
from app.nlp.skills import SOFT_SKILLS, skill_key
from app.schemas import InterviewQuestion, InterviewQuestionSet, InterviewRequest, InterviewResponse
from app.services.structured import run_structured

SYSTEM_PROMPT = (
    "You are an experienced hiring manager. Write interview questions that probe the specific claims in "
    "this candidate's resume against the job's requirements. Mix technical depth, past experience, skill "
    "gaps and behavioural questions. Each question needs a one-sentence rationale for the interviewer."
)


def heuristic_questions(req: InterviewRequest) -> InterviewQuestionSet:
    have = {skill_key(s) for s in req.profile.skills}
    required = [s for s in req.job.required_skills if s not in SOFT_SKILLS]
    matched = [s for s in required if skill_key(s) in have]
    missing = [s for s in required if skill_key(s) not in have]
    title = req.job.title or "this role"
    qs: list[InterviewQuestion] = []
    for skill in matched[:3]:
        qs.append(
            InterviewQuestion(
                question=f"Walk me through the most complex system you built with {skill}. "
                f"What trade-offs did you make "
                f"and what would you change today?",
                category="technical",
                difficulty="hard",
                rationale=f"{skill} is a core requirement and appears on the resume; "
                "validates depth, not just exposure.",
            )
        )
    if req.profile.experience:
        role = req.profile.experience[0]
        where = f" at {role.company}" if role.company else ""
        qs.append(
            InterviewQuestion(
                question=f"In your role as {role.title or 'your most recent position'}{where}, what was the "
                f"highest-impact project you owned end to end, and how did you measure success?",
                category="experience",
                difficulty="medium",
                rationale="Verifies ownership and impact of the most recent, most relevant role.",
            )
        )
        if role.highlights:
            qs.append(
                InterviewQuestion(
                    question=f'Your resume says: "{role.highlights[0][:160]}". What was your specific contribution '
                    f"and what obstacles did you hit?",
                    category="experience",
                    difficulty="medium",
                    rationale="Probes a concrete resume claim to separate individual from team contribution.",
                )
            )
    for skill in missing[:2]:
        qs.append(
            InterviewQuestion(
                question=f"This role relies on {skill}, which isn't on your resume. How have you approached learning a "
                f"comparable technology quickly, and how would you ramp up on {skill}?",
                category="gap",
                difficulty="medium",
                rationale=f"{skill} is required but not evidenced; assesses learning agility and adjacent experience.",
            )
        )
    if req.profile.projects:
        proj = req.profile.projects[0]
        qs.append(
            InterviewQuestion(
                question=f"Tell me about '{proj.name}'. Why did you choose that design, and how did you test it?",
                category="technical",
                difficulty="medium",
                rationale="Self-directed projects reveal engineering judgement and motivation.",
            )
        )
    qs.append(
        InterviewQuestion(
            question="Describe a time you disagreed with a teammate or stakeholder on a technical decision. "
            "How was it resolved?",
            category="behavioral",
            difficulty="medium",
            rationale="Assesses collaboration and conflict resolution.",
        )
    )
    qs.append(
        InterviewQuestion(
            question=f"What attracts you to the {title} position, and what would you want to accomplish in your first "
            f"90 days?",
            category="culture",
            difficulty="easy",
            rationale="Gauges motivation and alignment with the role.",
        )
    )
    qs.append(
        InterviewQuestion(
            question="Tell me about a production incident or major bug you were involved in. What did you learn?",
            category="behavioral",
            difficulty="medium",
            rationale="Assesses ownership, debugging and accountability.",
        )
    )
    if req.job.required_skills and req.profile.years_of_experience < 2:
        qs.append(
            InterviewQuestion(
                question="How do you decide when to ask for help versus keep investigating a problem on your own?",
                category="behavioral",
                difficulty="easy",
                rationale="Important signal for early-career candidates.",
            )
        )
    return InterviewQuestionSet(questions=qs[: req.count])


def generate_questions(req: InterviewRequest, llm: LLMProvider) -> InterviewResponse:
    draft = heuristic_questions(req)
    result, source = run_structured(
        llm,
        task="interview_questions",
        system=SYSTEM_PROMPT,
        prompt=(
            f'Generate {req.count} questions.\n<job title="{req.job.title}">{req.job.description[:15_000]}'
            f"</job>\n<candidate>{req.profile.model_dump_json()}</candidate>"
        ),
        model=InterviewQuestionSet,
        draft=draft,
    )
    return InterviewResponse(questions=result.questions[: req.count], llm_provider=llm.name, source=source)
