# Repository Guidelines

## Project Structure

MindMappr is split into a FastAPI API and a Next.js application. Keep backend
code in `backend/backends/`: routers expose HTTP endpoints, services hold study
logic, schemas define request and response models, and `backend/tests/` contains
pytest coverage. Database migrations live in `backend/alembic/`. Keep the web
application in `frontend/`; pages and route handlers are in `frontend/app/`,
shared browser/server helpers are in `frontend/lib/`, types are in
`frontend/types/`, and browser tests are in `frontend/tests/e2e/`. For all
Next.js-specific requirements, read and follow `frontend/AGENTS.md` before
editing frontend code.

## Traps — read before debugging a connection problem

**"Cannot reach the server" almost never means the server is down.** The home
form prints *"Cannot reach the server. Make sure the backend is running."*
whenever `fetch` rejects. But `fetch` rejects for two unrelated reasons — the
server is unreachable, **or** the browser blocked a response whose origin is
not in the backend's CORS allowlist. Both surface as `TypeError: Failed to
fetch`, so that message is a guess, and it is usually wrong. Do not open with a
backend restart.

Diagnose in this order:

```bash
# 1. Is the backend up? A 200 here means the error message is lying to you.
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8001/health

# 2. Is the page's EXACT origin allowed? Empty output = blocked = your bug.
curl -s -D - -o /dev/null -X OPTIONS http://localhost:8001/study \
  -H "Origin: http://127.0.0.1:3004" -H "Access-Control-Request-Method: POST" \
  | grep -i access-control-allow-origin

# 3. Is a shell export masking the committed default? Resolve by listening
#    port, not process name -- that finds whatever is serving :8001.
ps eww -p "$(lsof -nP -tiTCP:8001 -sTCP:LISTEN | head -1)" | tr ' ' '\n' | grep '^CORS_ORIGINS='

# 4. Is the thing on :8001 even this repo? cwd settles it.
lsof -p "$(lsof -nP -tiTCP:8001 -sTCP:LISTEN | head -1)" -a -d cwd -Fn
```

Step 3 is the one that hides. `CORS_ORIGINS` replaces the committed default
outright rather than extending it, and an export lives in one shell only —
invisible to other shells, to fresh clones, and to every file you can grep. The
running process then serves an origin that appears nowhere in the repo, so the
code looks broken while the server looks fine, and it breaks on the next
restart from a different terminal. Persist new origins in
`_DEFAULT_CORS_ORIGINS`, never in a shell export. Note also that
`http://localhost:X` and `http://127.0.0.1:X` are **distinct origins** to the
browser; list both spellings.

**Two Mindmappr checkouts share this machine.** This repo pins frontend 3004 /
backend 8001; `~/Personal_Project/Mindmappr` uses 3000 / 8000. Upstream both
backends default to 8000, so before the split whichever started first won the
port and the other checkout's frontend silently talked to it. Two consequences:
tokens are not cross-valid (the two trust different Supabase projects, so a
mismatched pairing returns 401 "Invalid token", which reads as a login bug),
and Playwright's `reuseExistingServer` will **silently test the wrong
application**, failing with baffling selector errors. Confirm which checkout
serves a port with `lsof -p <pid> -a -d cwd -Fn` before blaming this repo.

**Two test-suite traps.** `conftest.py` clears `CORS_ORIGINS` on purpose —
without it the CORS tests pass against whatever a developer exports and hide
the exact bug they exist to catch, so never "helpfully" restore it. And the
rate limiter is a single in-memory counter for the whole app: `POST /study` is
capped at 5/minute, so a test that spends that budget makes *unrelated* later
tests fail with 429. Assert CORS behaviour against the unlimited `GET /study`.

## Development Commands

Set up and run the API from its service directory:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backends.main:app --reload --port 8001   # 8001, not 8000 -- another checkout on this machine serves 8000
```

Set up and run the frontend separately:

```bash
cd frontend
npm install
npm run dev
```

## Style

Follow the surrounding code and keep changes focused. In Python, use explicit
imports, type annotations where they clarify interfaces, and FastAPI routers,
schemas, and services for their existing responsibilities. In TypeScript,
preserve strict types, use the configured `@/` imports when appropriate, and
keep components, client/server boundaries, and reusable helpers in their
current locations. Let ESLint and the Next.js configuration guide formatting
and framework conventions.

For user-facing UI copy, generally prefer lowercase wording for navigation,
buttons, and short labels. Preserve capitalization where grammar, proper
nouns, or established technical terms require it.

## Testing

Run the relevant checks before requesting review:

```bash
cd backend
pytest tests -q

cd frontend
npm run lint
npm run build
```

Add or update focused pytest tests for API changes. The Playwright suite uses
`frontend/tests/e2e/`; supply `E2E_EMAIL` and `E2E_PASSWORD` for authenticated
browser testing. Its configuration is in `frontend/playwright.config.ts`.

## Commits and Pull Requests

Use concise, imperative commit subjects that describe one coherent change.
In pull requests, explain the user-facing or API impact, list validation run,
and call out configuration or migration steps. Include screenshots for visible
frontend changes. Keep unrelated refactors out of feature or fix pull requests.

## Configuration Safety

Store local backend settings in the ignored files `backend/.env` and
`frontend/.env.local`; use `backend/.env.example` for safe placeholders. Never
commit credentials, Supabase keys, tokens, or E2E account values. Check that
new configuration is documented without exposing its secret value.
