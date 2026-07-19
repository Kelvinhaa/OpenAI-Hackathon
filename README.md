# OpenAI Hackathon MindMappr

MindMappr turns a study topic, available time, learner level, and goal into a
practical study plan and a small prerequisite map. Learners can explain a
concept in their own words, receive concise formative feedback, choose their
own recall rating, and return when that concept is due for review.

## What it does

- Generates a subject-specific study plan with timed techniques and tips.
- Creates a 4–6 concept learning map with prerequisite relationships.
- Provides retrieval-practice feedback before the learner records a rating.
- Schedules concept-level reviews with FSRS-inspired stability and difficulty
  state.
- Keeps saved maps and a due-concept review queue per signed-in learner.
- Offers a guest planner and an illustrative, reduced-motion-safe retention
  preview before sign-in.

## Architecture

| Part | Responsibility |
| --- | --- |
| `frontend/` | Next.js 16 and React 19 interface, Supabase sign-in, map workspace, library, and review flow. |
| `backend/` | FastAPI API, OpenAI Responses API integration, concept-level review scheduling, and ownership checks. |
| `backend/alembic/` | Database migrations for study sessions, concepts, edges, and review events. |
| `backend/tests/` | Pytest coverage for models, generation services, FSRS scheduling, and API routes. |
| `frontend/tests/e2e/` | Playwright coverage for guest, planner, map, retention, and review journeys. |

The frontend communicates with the backend through `NEXT_PUBLIC_API_URL`. The
backend uses Supabase JWTs to scope saved study data to its owner. OpenAI calls
stay server-side: the browser never receives `OPENAI_API_KEY`.

## Prerequisites

- Python 3.11+
- Node.js 20+
- A Supabase project for authentication and Postgres
- An OpenAI API key for signed-in plan/map generation and recall feedback
- Redis when using the production rate limiter

## Local setup

Create `backend/.env` with your local values:

```dotenv
OPENAI_API_KEY=your_openai_key
DATABASE_URL=postgresql+psycopg://user:password@host:6543/postgres
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
REDIS_URL=redis://default:password@host:port
CORS_ORIGINS=http://localhost:3000
```

Create `frontend/.env.local` with the public values used by the browser:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
NEXT_PUBLIC_API_URL=http://localhost:8001
```

`backend/.env.example` contains safe backend placeholders. Do not commit either
local environment file, API keys, service-role keys, JWT secrets, or test-user
passwords.

Start the API in one terminal:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backends.main:app --reload --port 8001
```

The API is pinned to **8001** rather than the usual 8000 so it cannot collide with
another FastAPI backend on the same machine. Two backends sharing a port is not a
loud failure: the second one to start simply loses, and the other project's
frontend then talks to whichever won — producing `401 Invalid token` on every
signed-in request, because the two trust different Supabase projects.

Start the web app in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Apply outstanding database
migrations before using a fresh Postgres database:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

## Configuration reference

| Variable | Used by | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Backend | Generates structured plans/maps and retrieval feedback. |
| `DATABASE_URL` | Backend | SQLAlchemy/Postgres connection string. |
| `SUPABASE_URL` | Backend | Supabase project URL used for authentication configuration. |
| `SUPABASE_JWT_SECRET` | Backend | Verifies Supabase access tokens. |
| `REDIS_URL` | Backend | Rate-limit storage. |
| `CORS_ORIGINS` | Backend | Comma-separated allowed frontend origins. |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Frontend | Browser-safe Supabase publishable key. |
| `NEXT_PUBLIC_API_URL` | Frontend | FastAPI base URL; defaults to `http://localhost:8001`. |
| `E2E_EMAIL` / `E2E_PASSWORD` | Playwright | Local test account for authenticated browser tests. |
| `PLAYWRIGHT_BASE_URL` | Playwright | Optional frontend URL; defaults to `http://127.0.0.1:3000`. |

## Demo path

1. Open the home page and enter **Cell division**, **45 minutes**,
   **Intermediate**, and a goal such as **Prepare for a quiz**.
2. As a guest, review the generated plan and the illustrative retention trend.
3. Sign in or register, then generate the plan again and select **Open learning
   map**.
4. Select **Mitosis**, explain why it produces identical cells, select **Check
   recall**, and choose the rating that best reflects your recall.
5. Visit **Library** to reopen the saved map or **Review** to work through due
   concepts.

## Checks

Run the backend suite from its virtual environment:

```bash
cd backend
source .venv/bin/activate
pytest tests -q
```

Run frontend static checks:

```bash
cd frontend
npm run lint
npm run build
```

Run browser tests after configuring the E2E account above:

```bash
cd frontend
npm run test:e2e
```

## Built with Codex and GPT-5.6

Codex accelerated the frontend, FastAPI routes, database migration, automated
tests, and project documentation. GPT-5.6 is used through the OpenAI Responses
API with structured Pydantic outputs to create the study plan and learning map,
and to provide bounded formative feedback on retrieval-practice answers.

The learner remains in control of the rating: the model can suggest a rating,
but only the learner's selected `Again`, `Hard`, `Good`, or `Easy` rating updates
the review schedule.
