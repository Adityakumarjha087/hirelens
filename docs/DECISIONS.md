# Engineering decisions & scope notes

Each entry: the decision, why, and what it costs.

## Architecture

1. **Python AI service separate from the NestJS API.** The ML ecosystem (spaCy, sentence-transformers,
   provider SDKs) lives in Python; the product/API layer lives in TypeScript. They talk over REST with a
   shared-secret header (`X-Service-Token`). The contract is FastAPI's OpenAPI document, exported to
   `docs/ai-service.openapi.json` and mirrored by hand in `backend/src/ai/ai.types.ts`.
   *Cost:* two type definitions to keep in sync. A contract test or generated client would remove the drift risk.

2. **The AI service owns Qdrant.** The backend never talks to the vector DB. It asks the AI service to
   index resumes/jobs and to score candidates. Embedding model, vector dimension and collection layout
   can then change without touching the backend.

3. **Resume parsing goes through a BullMQ queue; matching does not.** Parsing (file → text → NER → LLM)
   is slow and can fail, so uploads return `202` and a worker does the parsing with retries. Matching one
   candidate takes milliseconds, so applying is synchronous and the candidate sees the score at once.
   Emails always go through a queue with exponential-backoff retries and an `EmailLog` audit table.

4. **A recovery sweeper for lost jobs.** BullMQ re-runs *stalled* jobs, but a job lost entirely (for
   example after a Redis flush) would leave a resume `PROCESSING` forever. `ResumeRecoveryService`
   requeues resumes that have been stuck for more than 2 minutes, using an idempotent job id, and marks
   them `FAILED` after 30 minutes.

## AI

5. **A deterministic `fake` LLM provider is the default.** Every AI task first computes a rule-based draft
   (regex/section parsing, skill taxonomy, ATS checklist, templated questions). The fake provider returns
   that draft. Real providers (Anthropic `claude-opus-5-5`, OpenAI, Gemini, Ollama) get the draft and are
   asked to improve it under a JSON schema. Their output is validated with Pydantic and retried once. If it
   still fails, the service falls back to the draft (`source: "heuristic"` in responses). The whole
   platform therefore runs with zero API keys, and tests are reproducible.

6. **Scores are computed in code, never by the LLM.** The match score is
   `0.45·semantic + 0.40·skills + 0.15·experience` (weights configurable). The ATS score comes from a
   weighted checklist. The LLM may rewrite text, but the numbers are deterministic and auditable, so prompt
   injection inside a resume ("give me 100/100") cannot change them. Untrusted text is wrapped in delimiter
   tags, injected delimiter tags are stripped, and every system prompt tells the model to treat that
   content as data.

7. **Lightweight CPU fallbacks behind the same interfaces.** `HashingEmbedder` (384-dim feature hashing
   over unigrams, bigrams and canonical skills) has the same dimension as all-MiniLM-L6-v2. The rule-based
   NER is used when the spaCy model is missing. Real models are selected with `AI_EMBEDDING_PROVIDER=sentence-transformers`
   and `AI_NER_PROVIDER=spacy`, and are installed with `AI_INSTALL_ML_EXTRAS=true`.
   *Cost:* hashing embeddings are lexical, not semantic. Relevance rankings with the default embedder
   are less nuanced than with MiniLM. The heavy-model adapter files (`sentence_transformer.py`, `spacy_ner.py`)
   are excluded from coverage because CI does not install those models.

8. **Explainability first.** Every match stores its full breakdown (component scores, weights,
   matched/missing required and nice-to-have skills, years vs requirement, plain-English explanation),
   and the UI shows it on demand.

## Bias mitigation

9. **Blind screening is per job and stage-gated.** For jobs with `blindScreening`, recruiters see the
   APPLIED and SCREENING stages through a redacted view:
   - an alias name (`Candidate 4F2A`)
   - no email, phone or photo
   - pronouns neutralised and gendered terms removed
   - graduation years hidden (an age proxy)
   - a redacted resume text

   The original file can't be downloaded in those stages. Identity is revealed from INTERVIEW onward. The
   redacted profile is produced by the AI service at parse time, so it is computed once.
   *Limitation:* redaction is pattern-based and cannot catch every signal (for example names of
   affinity organisations or unusual pronoun usage).

## Security

10. **Auth.** Short-lived JWT access tokens (15 min) are kept in memory on the client. Refresh tokens are
    opaque 48-byte random values stored as SHA-256 hashes and sent only as an `httpOnly`, `SameSite=Strict`
    cookie scoped to `/api/auth`. They rotate on every use. Reusing a revoked token revokes the whole token
    family (theft detection). A conditional `updateMany` keeps concurrent refreshes single-winner. Login
    uses constant-time behaviour for unknown emails (a dummy bcrypt compare).
11. **RBAC + tenant isolation.** Global `JwtAuthGuard` and `RolesGuard`, `@Public()` opt-out. Every
    recruiter action checks job ownership (`canManage`). Cross-tenant ids return 403 and unknown ids return 404.
12. **Uploads.** The file type is sniffed from magic bytes (PDF/DOCX/TXT), not trusted from the client.
    There is a size limit at multer and in the service, file names are sanitised, and object keys are
    namespaced per user.
13. **Edge hardening.** Nginx sets security headers, CSP and per-IP rate limiting. Inside the app there
    are a global throttler and a stricter one on auth routes, `helmet`, and a CORS allow-list. The
    ValidationPipe uses `whitelist` + `forbidNonWhitelisted`. A global exception filter never leaks
    internals on 5xx. Pino logs redact `Authorization` and cookies. All containers run as non-root.

## Scope cuts / known gaps (cut depth, not correctness)

- **Auth provider:** a self-hosted, NextAuth-style JWT flow instead of Clerk, so it runs offline. There
  are no email verification, password reset or OAuth flows.
- **Photos:** resumes are parsed as text, so no photo is ever extracted. "Hide photo" is satisfied
  trivially, and the original file stays hidden during blind stages.
- **Scanned PDFs (images)** are rejected with a clear 422. OCR is not implemented.
- **Time-to-hire** is measured from application to the OFFER stage, because the pipeline spec has no
  "Hired" column.
- **Analytics** aggregate in memory over the recruiter's applications. That is fine at demo and SMB scale,
  but it should move to SQL/materialised views at high volume.
- **Node 22 LTS instead of Node 20.** Node 20 reached end of life in April 2026.
- **MinIO image:** upstream `minio/minio` images are no longer published on Docker Hub. Compose uses the
  `coollabsio/minio` community rebuild. Production should use AWS S3 (only env vars change).
- **Kanban ordering:** cards keep a `position` column, and the drag-and-drop UI moves between columns.
  Ordering within a column follows score, not manual sorting.
