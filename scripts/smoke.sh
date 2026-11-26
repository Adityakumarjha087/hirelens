#!/usr/bin/env bash
# End-to-end smoke test of every major HireLens feature against a running stack.
# Usage: BASE=http://localhost:20200 MAILPIT=http://localhost:20216 bash scripts/smoke.sh
set -euo pipefail

BASE="${BASE:-http://localhost:20200}"
API="$BASE/api"
MAILPIT="${MAILPIT:-http://localhost:20216}"
JAR="$(mktemp)"
TMP="$(mktemp -d)"
trap 'rm -rf "$JAR" "$TMP"' EXIT
PASS=0
FAIL=0
STAMP="$(date +%s)$RANDOM"

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1], {'d': d}))" "$1"; }
ok() { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
ko() { FAIL=$((FAIL + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
check() { if eval "$2"; then ok "$1"; else ko "$1"; fi; }
# req METHOD PATH [TOKEN] [JSON]  -> body in $TMP/body, status in $CODE
req() {
  local args=(-s -o "$TMP/body" -w '%{http_code}' -X "$1" "$API$2" -b "$JAR" -c "$JAR")
  [[ -n "${3:-}" ]] && args+=(-H "Authorization: Bearer $3")
  [[ -n "${4:-}" ]] && args+=(-H 'Content-Type: application/json' --data "$4")
  CODE=$(curl "${args[@]}")
}
body() { cat "$TMP/body"; }

echo "== HireLens smoke test against $BASE"
start=$(date +%s)

echo "-- Health"
req GET /health
check "backend /api/health is ok (db, redis, ai, storage up)" '[[ $CODE == 200 && $(body | json "d[\"status\"]") == ok ]]'
check "AI service reachable through backend health" '[[ $(body | json "d[\"checks\"][\"ai\"][\"status\"]") == up ]]'
check "edge /healthz" '[[ $(curl -s -o /dev/null -w "%{http_code}" "$BASE/healthz") == 200 ]]'
check "security headers present" 'curl -sI "$BASE/" | grep -qi "x-frame-options: DENY"'

echo "-- Auth"
CAND_EMAIL="smoke-$STAMP@example.com"
req POST /auth/register "" "{\"email\":\"$CAND_EMAIL\",\"password\":\"Sm0kePassw0rd\",\"fullName\":\"Sam Smoke\",\"role\":\"CANDIDATE\"}"
check "register candidate (201)" '[[ $CODE == 201 ]]'
CAND=$(body | json 'd["accessToken"]')
req GET /auth/me "$CAND"
check "GET /auth/me with access token" '[[ $CODE == 200 && $(body | json "d[\"role\"]") == CANDIDATE ]]'
req POST /auth/refresh
check "refresh token rotation via httpOnly cookie" '[[ $CODE == 200 ]]'
CAND=$(body | json 'd["accessToken"]')
req GET /jobs
check "unauthenticated request rejected (401)" '[[ $CODE == 401 ]]'
req POST /auth/register "" '{"email":"bad","password":"x","fullName":"","role":"ADMIN"}'
check "invalid registration rejected (400)" '[[ $CODE == 400 ]]'

echo "-- Resume upload + AI parsing (queue)"
cat > "$TMP/resume.txt" <<RES
Sam Smoke
Senior Backend Engineer
$CAND_EMAIL | +1 415 555 0101 | San Francisco, CA

SUMMARY
Backend engineer with 6 years of experience in Python, Go and distributed systems.

SKILLS
Python, Go, PostgreSQL, Kafka, Docker, Kubernetes, AWS

EXPERIENCE
Senior Software Engineer — Acme Payments Inc (Feb 2021 - Present)
- Built an event pipeline on Kafka handling 12M events/day
- Responsible for maintaining the ledger service
Software Engineer, Initech | Jan 2019 – Jan 2021
- Reduced p99 latency by 40% with Redis caching

EDUCATION
B.S. in Computer Science, Stanford University, 2018
RES
CODE=$(curl -s -o "$TMP/body" -w '%{http_code}' -X POST "$API/resumes" -H "Authorization: Bearer $CAND" -F "file=@$TMP/resume.txt;type=text/plain")
check "upload resume accepted (202)" '[[ $CODE == 202 ]]'
RESUME_ID=$(body | json 'd["id"]')
t0=$(date +%s%N)
for _ in $(seq 1 60); do
  req GET "/resumes/$RESUME_ID" "$CAND"
  STATUS=$(body | json 'd["status"]')
  [[ $STATUS == PARSED || $STATUS == FAILED ]] && break
  sleep 0.5
done
PARSE_MS=$(( ($(date +%s%N) - t0) / 1000000 ))
check "resume parsed asynchronously (${PARSE_MS}ms)" '[[ $STATUS == PARSED ]]'
check "structured profile extracted (skills, years, education)" '[[ $(body | json "\"Kafka\" in d[\"skills\"] and d[\"yearsExperience\"] >= 5 and len(d[\"parsed\"][\"profile\"][\"education\"]) == 1") == True ]]'
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/resumes" -H "Authorization: Bearer $CAND" -F "file=@/bin/ls;filename=cv.pdf")
check "binary disguised as PDF rejected (400)" '[[ $CODE == 400 ]]'

echo "-- Recruiter: job posting with automatic skill extraction"
req POST /auth/login "" '{"email":"recruiter@hirelens.dev","password":"Password123!"}'
check "seeded recruiter login" '[[ $CODE == 200 ]]'
REC=$(body | json 'd["accessToken"]')
JOB_DESC='Requirements:\n- 5+ years of experience with Python and PostgreSQL\n- Kafka, Docker and Kubernetes in production\nNice to have:\n- Go, Terraform'
req POST /jobs/analyze "$REC" "{\"title\":\"Staff Data Platform Engineer\",\"description\":\"$JOB_DESC\"}"
check "AI extracts required vs nice-to-have skills" '[[ $CODE == 200 && $(body | json "\"Kafka\" in d[\"required_skills\"] and \"Go\" in d[\"nice_to_have_skills\"] and d[\"min_years_experience\"] == 5") == True ]]'
req POST /jobs "$REC" "{\"title\":\"Staff Data Platform Engineer\",\"description\":\"$JOB_DESC\",\"location\":\"San Francisco, CA\",\"remote\":true,\"blindScreening\":true}"
check "create job (201)" '[[ $CODE == 201 ]]'
JOB_ID=$(body | json 'd["id"]')

echo "-- Candidate applies: explainable match score"
req GET "/jobs?q=Staff%20Data" "$CAND"
check "candidate finds the job via search" '[[ $(body | json "d[\"total\"]") -ge 1 ]]'
t0=$(date +%s%N)
req POST "/jobs/$JOB_ID/applications" "$CAND" '{"coverLetter":"Excited to apply!"}'
APPLY_MS=$(( ($(date +%s%N) - t0) / 1000000 ))
check "apply (201, ${APPLY_MS}ms incl. vector match)" '[[ $CODE == 201 ]]'
APP_ID=$(body | json 'd["id"]')
SCORE=$(body | json 'd["matchScore"]')
check "match score with breakdown (score=$SCORE)" '[[ $(body | json "d[\"matchScore\"] > 60 and len(d[\"scoreBreakdown\"][\"explanation\"]) > 0") == True ]]'
req POST "/jobs/$JOB_ID/applications" "$CAND" '{}'
check "duplicate application rejected (409)" '[[ $CODE == 409 ]]'

echo "-- Ranked list, filters, blind screening"
req GET "/jobs/$JOB_ID/applications?minScore=50&skills=python,kafka" "$REC"
check "ranked + filtered candidates" '[[ $CODE == 200 && $(body | json "len(d)") -ge 1 ]]'
check "blind screening hides name/email" '[[ $(body | json "d[0][\"blind\"] and d[0][\"candidate\"][\"email\"] is None and \"Sam\" not in d[0][\"candidate\"][\"name\"]") == True ]]'
req GET "/jobs/$JOB_ID/applications" "$CAND"
check "candidate cannot list applicants (403)" '[[ $CODE == 403 ]]'

echo "-- Pipeline, interview questions, notes"
req PATCH "/applications/$APP_ID/stage" "$REC" '{"stage":"SCREENING"}'
check "move to Screening" '[[ $CODE == 200 ]]'
req PATCH "/applications/$APP_ID/stage" "$REC" '{"stage":"INTERVIEW"}'
check "move to Interview reveals identity" '[[ $CODE == 200 && $(body | json "d[\"blind\"]") == False ]]'
req POST "/applications/$APP_ID/interview-questions" "$REC" '{"count":6}'
check "AI interview questions generated" '[[ $CODE == 200 && $(body | json "len(d)") == 6 ]]'
req PATCH "/applications/$APP_ID/notes" "$REC" '{"notes":"Great Kafka depth"}'
check "recruiter notes saved" '[[ $CODE == 200 ]]'
req PATCH "/applications/$APP_ID/stage" "$REC" '{"stage":"OFFER"}'
check "move to Offer" '[[ $CODE == 200 ]]'

echo "-- Candidate feedback"
req POST /feedback "$CAND" "{\"resumeId\":\"$RESUME_ID\",\"jobId\":\"$JOB_ID\"}"
check "ATS score + missing keywords + bullet rewrites" '[[ $CODE == 201 && $(body | json "0 <= d[\"atsScore\"] <= 100 and len(d[\"result\"][\"bullet_rewrites\"]) > 0") == True ]]'
req GET /applications/mine "$CAND"
check "candidate sees application at Offer" '[[ $(body | json "d[0][\"stage\"]") == OFFER ]]'

echo "-- Analytics + admin"
req GET /analytics/recruiter "$REC"
check "recruiter analytics (applicants/avg score/time-to-hire)" '[[ $CODE == 200 && $(body | json "d[\"totals\"][\"applicants\"] > 0 and d[\"totals\"][\"avgMatchScore\"] is not None") == True ]]'
req POST /auth/login "" '{"email":"admin@hirelens.dev","password":"Password123!"}'
ADMIN=$(body | json 'd["accessToken"]')
req GET "/admin/users?role=CANDIDATE" "$ADMIN"
check "admin lists users" '[[ $CODE == 200 && $(body | json "d[\"total\"]") -ge 1 ]]'

echo "-- Email notifications (queue -> Mailpit)"
sent=0
for _ in $(seq 1 30); do
  sent=$(curl -s "$MAILPIT/api/v1/search?query=to:$CAND_EMAIL" | json 'd["messages_count"]' 2>/dev/null || echo 0)
  [[ $sent -ge 4 ]] && break
  sleep 1
done
check "candidate received $sent emails (applied + 3 stage changes)" '[[ $sent -ge 4 ]]'

echo "-- Logout"
req POST /auth/logout
check "logout revokes refresh token" '[[ $CODE == 204 ]]'
req POST /auth/refresh
check "refresh after logout rejected (401)" '[[ $CODE == 401 ]]'

echo
echo "== Smoke result: $PASS passed, $FAIL failed in $(( $(date +%s) - start ))s"
[[ $FAIL -eq 0 ]]
