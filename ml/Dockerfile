# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.12.9 /uv /usr/local/bin/uv
WORKDIR /app

FROM base AS deps
ARG INSTALL_ML_EXTRAS=false
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    if [ "$INSTALL_ML_EXTRAS" = "true" ]; then uv sync --frozen --no-dev --no-install-project --extra ml; \
    else uv sync --frozen --no-dev --no-install-project; fi

FROM base AS runtime
RUN groupadd -r app && useradd -r -g app -d /app app
COPY --from=deps /app/.venv /app/.venv
COPY app ./app
ENV PATH="/app/.venv/bin:$PATH" AI_ENV=production
USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--no-access-log"]
