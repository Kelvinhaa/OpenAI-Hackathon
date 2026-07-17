# OpenAI Hackathon MindMappr

OpenAI Hackathon MindMappr helps learners turn a subject, available study time,
experience level, and learning goal into a tailored study plan. Saved plans can
then be revisited using spaced-repetition review scheduling.

## Local development

The application consists of a FastAPI backend and a Next.js frontend.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backends.main:app --reload --port 8000
```

```bash
cd frontend-next
npm install
npm run dev
```

Set the backend variables in `backend/.env` and the frontend variables in
`frontend-next/.env.local`. Do not commit either file.

## Checks

```bash
cd backend && pytest tests -q
cd frontend-next && npm run lint && npm run build
```

Browser tests authenticate with a local Supabase test user. Provide
`E2E_EMAIL` and `E2E_PASSWORD`, then run `npm run test:e2e` from
`frontend-next/`.
