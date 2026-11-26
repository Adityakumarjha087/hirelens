"""Skill taxonomy and alias-aware skill extraction.

The taxonomy maps a canonical skill name to the aliases that appear in real resumes and
job descriptions. Matching is case-insensitive and boundary-aware so that "Java" does not
match "JavaScript" and "Go" only matches as a standalone token or "Golang".
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from functools import lru_cache

SKILL_TAXONOMY: dict[str, tuple[str, ...]] = {
    # Languages
    "Python": ("python", "python3"),
    "JavaScript": ("javascript", "js", "ecmascript", "es6"),
    "TypeScript": ("typescript", "ts"),
    "Java": ("java",),
    "Kotlin": ("kotlin",),
    "Go": ("golang", "go lang"),
    "Rust": ("rust",),
    "C++": ("c++", "cpp"),
    "C#": ("c#", "csharp"),
    "Ruby": ("ruby",),
    "PHP": ("php",),
    "Scala": ("scala",),
    "Swift": ("swift",),
    "R": ("r programming", "r language"),
    "SQL": ("sql",),
    "Bash": ("bash", "shell scripting", "shell"),
    # Frontend
    "React": ("react", "react.js", "reactjs"),
    "Next.js": ("next.js", "nextjs"),
    "Vue.js": ("vue", "vue.js", "vuejs"),
    "Angular": ("angular",),
    "Svelte": ("svelte",),
    "Redux": ("redux",),
    "HTML": ("html", "html5"),
    "CSS": ("css", "css3"),
    "Tailwind CSS": ("tailwind", "tailwindcss", "tailwind css"),
    "Vite": ("vite",),
    "Webpack": ("webpack",),
    # Backend / frameworks
    "Node.js": ("node", "node.js", "nodejs"),
    "Express": ("express", "express.js", "expressjs"),
    "NestJS": ("nestjs", "nest.js"),
    "Django": ("django",),
    "Flask": ("flask",),
    "FastAPI": ("fastapi",),
    "Spring Boot": ("spring boot", "springboot", "spring"),
    "Ruby on Rails": ("rails", "ruby on rails"),
    ".NET": (".net", "dotnet", "asp.net"),
    "GraphQL": ("graphql",),
    "REST APIs": ("rest", "restful", "rest api", "rest apis"),
    "gRPC": ("grpc",),
    "Microservices": ("microservices", "microservice"),
    # Data stores
    "PostgreSQL": ("postgresql", "postgres", "psql"),
    "MySQL": ("mysql",),
    "MongoDB": ("mongodb", "mongo"),
    "Redis": ("redis",),
    "Elasticsearch": ("elasticsearch", "elastic search", "opensearch"),
    "DynamoDB": ("dynamodb",),
    "Cassandra": ("cassandra",),
    "Kafka": ("kafka", "apache kafka"),
    "RabbitMQ": ("rabbitmq",),
    "Prisma": ("prisma",),
    "Snowflake": ("snowflake",),
    # Cloud / DevOps
    "AWS": ("aws", "amazon web services"),
    "GCP": ("gcp", "google cloud", "google cloud platform"),
    "Azure": ("azure", "microsoft azure"),
    "Docker": ("docker", "containers"),
    "Kubernetes": ("kubernetes", "k8s"),
    "Terraform": ("terraform",),
    "Ansible": ("ansible",),
    "CI/CD": ("ci/cd", "cicd", "continuous integration", "continuous delivery"),
    "GitHub Actions": ("github actions",),
    "Jenkins": ("jenkins",),
    "Linux": ("linux", "unix"),
    "Nginx": ("nginx",),
    "Git": ("git",),
    "Prometheus": ("prometheus",),
    "Grafana": ("grafana",),
    # ML / AI / data
    "Machine Learning": ("machine learning", "ml"),
    "Deep Learning": ("deep learning",),
    "NLP": ("nlp", "natural language processing"),
    "Computer Vision": ("computer vision",),
    "LLMs": ("llm", "llms", "large language models", "large language model"),
    "RAG": ("rag", "retrieval augmented generation", "retrieval-augmented generation"),
    "PyTorch": ("pytorch", "torch"),
    "TensorFlow": ("tensorflow",),
    "scikit-learn": ("scikit-learn", "sklearn", "scikit learn"),
    "Pandas": ("pandas",),
    "NumPy": ("numpy",),
    "Spark": ("spark", "pyspark", "apache spark"),
    "Airflow": ("airflow", "apache airflow"),
    "dbt": ("dbt",),
    "Hugging Face": ("hugging face", "huggingface", "transformers"),
    "LangChain": ("langchain",),
    "Vector Databases": ("vector database", "vector databases", "qdrant", "pinecone", "weaviate", "pgvector"),
    "MLOps": ("mlops",),
    "Data Analysis": ("data analysis", "data analytics"),
    "Statistics": ("statistics", "statistical modeling"),
    "Tableau": ("tableau",),
    "Power BI": ("power bi", "powerbi"),
    "Excel": ("excel",),
    # Testing / quality
    "Jest": ("jest",),
    "Pytest": ("pytest",),
    "Playwright": ("playwright",),
    "Cypress": ("cypress",),
    "Selenium": ("selenium",),
    "Unit Testing": ("unit testing", "unit tests", "tdd", "test-driven development"),
    # Mobile
    "React Native": ("react native",),
    "Flutter": ("flutter",),
    "Android": ("android",),
    "iOS": ("ios",),
    # Practices / soft
    "Agile": ("agile", "scrum", "kanban"),
    "System Design": ("system design", "distributed systems"),
    "Security": ("security", "owasp", "application security"),
    "Leadership": ("leadership", "led a team", "team lead", "mentoring", "mentored"),
    "Communication": ("communication", "stakeholder management"),
    "Product Management": ("product management", "roadmap", "product roadmap"),
    "UX Design": ("ux", "user experience", "figma", "ui/ux"),
}

SOFT_SKILLS = frozenset({"Leadership", "Communication", "Agile", "Product Management"})

# Aliases that are too ambiguous to match on their own in free text.
_CONTEXT_SENSITIVE = {
    "go",
    "r",
    "rest",
    "spring",
    "shell",
    "ml",
    "ts",
    "js",
    "node",
    "containers",
    "security",
    "ux",
    "rag",
    "communication",
    "transformers",
    "torch",
    "kanban",
    "roadmap",
}


def _alias_pattern(alias: str) -> str:
    escaped = re.escape(alias)
    # Custom boundaries: allow symbols like "+", "#", "." inside aliases.
    return rf"(?<![A-Za-z0-9+#]){escaped}(?![A-Za-z0-9+#])"


@lru_cache(maxsize=1)
def _compiled() -> list[tuple[str, re.Pattern[str]]]:
    compiled: list[tuple[str, re.Pattern[str]]] = []
    for canonical, aliases in SKILL_TAXONOMY.items():
        strong = [a for a in aliases if a not in _CONTEXT_SENSITIVE]
        if not strong:
            strong = list(aliases)
        pattern = "|".join(_alias_pattern(a) for a in sorted(strong, key=len, reverse=True))
        compiled.append((canonical, re.compile(pattern, re.IGNORECASE)))
    return compiled


@lru_cache(maxsize=1)
def _alias_index() -> dict[str, str]:
    index: dict[str, str] = {}
    for canonical, aliases in SKILL_TAXONOMY.items():
        index[canonical.lower()] = canonical
        for alias in aliases:
            index.setdefault(alias.lower(), canonical)
    return index


def normalize_skill(skill: str) -> str:
    """Map any alias (any casing) to the canonical skill name; unknown skills are title-cased."""
    cleaned = re.sub(r"\s+", " ", skill.strip())
    if not cleaned:
        return ""
    canonical = _alias_index().get(cleaned.lower())
    if canonical:
        return canonical
    return cleaned if any(c.isupper() for c in cleaned) else cleaned.title()


def normalize_skills(skills: Iterable[str]) -> list[str]:
    seen: dict[str, None] = {}
    for skill in skills:
        norm = normalize_skill(skill)
        if norm and norm.lower() not in {s.lower() for s in seen}:
            seen[norm] = None
    return list(seen)


def extract_skills(text: str) -> list[str]:
    """Return canonical skills found in ``text`` ordered by first occurrence."""
    hits: list[tuple[int, str]] = []
    for canonical, pattern in _compiled():
        match = pattern.search(text)
        if match:
            hits.append((match.start(), canonical))
    hits.sort()
    return [skill for _, skill in hits]


def extract_skills_from_list(line: str) -> list[str]:
    """For short comma-separated lists ("Go, Terraform and R"), accept ambiguous aliases too."""
    if len(line) > 120 or ("," not in line and " and " not in line and "/" not in line):
        return []
    index = _alias_index()
    tokens = re.split(r",|;|\band\b|\bor\b|/(?!cd)", line, flags=re.IGNORECASE)
    found = []
    for tok in tokens:
        key = re.sub(
            r"^(?:experience with|knowledge of|familiarity with|exposure to)\s+",
            "",
            tok.strip(" .-*•()"),
            flags=re.IGNORECASE,
        ).lower()
        if key in index:
            found.append(index[key])
    return found


def skill_key(skill: str) -> str:
    return normalize_skill(skill).lower()
