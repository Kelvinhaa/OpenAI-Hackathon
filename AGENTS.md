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
