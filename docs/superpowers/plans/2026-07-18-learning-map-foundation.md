# Learning Map Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Anthropic with OpenAI generation and establish the persisted, concept-level learning-map foundation for MindMappr.

**Architecture:** Keep `StudySession` as the owner-scoped parent record. Introduce learning-map concepts, prerequisite edges, and review events; store FSRS state on concepts. The generation service will use the OpenAI Responses API and validate one structured plan-and-map result before any persistence occurs.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, OpenAI Python SDK, pytest, Next.js 16, React 19.

## Global Constraints

- Use `OPENAI_API_KEY` server-side only; do not read or commit local `.env` files.
- Use the OpenAI Responses API with model `gpt-5.6-luna`, `reasoning={"effort": "low"}`, and typed structured outputs.
- All persisted study data remains constrained to the authenticated user.
- Generated maps contain 4–6 unique concepts and prerequisite-to-dependent edges.
- FSRS state belongs to a concept, not a parent study session.
- Follow test-first development and add an Alembic migration for all schema changes.

---

### Task 1: Migrate the plan generator to OpenAI

**Files:**
- Modify: `backend/requirements.txt`, `backend/.env.example`, `backend/backends/services/study.py`
- Create: `backend/tests/test_study_service.py`

**Produces:** `generate_recommendation(subject, level, time, goal)` backed by OpenAI Responses structured output and a typed, safe failure path.

- [ ] Write a failing unit test that mocks the OpenAI client and validates a structured study recommendation.
- [ ] Run the focused test and confirm it fails before the provider implementation exists.
- [ ] Replace the Anthropic client and dependency with `AsyncOpenAI`, use `responses.parse` with `StudyRecommendation`, and retain safe fallback output for provider failures.
- [ ] Replace the example key name with `OPENAI_API_KEY`; never modify local environment files.
- [ ] Run `pytest tests/test_study_service.py -q` and commit the task.

### Task 2: Persist learning maps and concept review state

**Files:**
- Modify: `backend/backends/models.py`, `backend/backends/schemas/study.py`
- Create: `backend/alembic/versions/20260718_01_add_learning_maps.py`, `backend/tests/test_study_models.py`

**Produces:** `ConceptNode`, `ConceptEdge`, `ConceptReviewEvent`, and validated `GeneratedLearningExperience` contracts.

- [ ] Write failing tests for concept ownership and rejection of duplicate/missing-edge concept keys.
- [ ] Run them and confirm the model/schema behaviours do not exist yet.
- [ ] Add parent relationships, unique concept keys per session, a no-self-edge constraint, node-level FSRS fields, and the matching migration.
- [ ] Add Pydantic contracts that enforce 4–6 unique concepts and valid edges.
- [ ] Run `pytest tests/test_study_models.py -q` and commit the task.

### Task 3: Generate and atomically save a complete plan plus map

**Files:**
- Modify: `backend/backends/services/study.py`, `backend/backends/routers/study.py`, `backend/backends/schemas/study.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_study_routes.py`

**Consumes:** `GeneratedLearningExperience` from Task 2.

**Produces:** authenticated `POST /study` that persists a parent plan, concepts, and edges in one transaction, and returns no partial state when generation fails.

- [ ] Write failing route tests for successful plan/map persistence and a 502 rollback on generation failure.
- [ ] Run the focused tests and confirm they fail for the missing map response/persistence behavior.
- [ ] Implement typed OpenAI learning-map generation and map persistence only after validation succeeds.
- [ ] Extend API responses with deterministic concept and edge data.
- [ ] Run `pytest tests/test_study_routes.py -q` and commit the task.

### Task 4: Prepare typed frontend map contracts

**Files:**
- Modify: `frontend/types/study.ts`
- Create: `frontend/tests/types-study.test.ts` only if the existing test toolchain supports standalone type tests; otherwise validate with `npm run build`.

**Consumes:** Task 3 response contracts.

**Produces:** strict TypeScript interfaces for maps, concepts, edges, retrieval feedback, and concept review responses without changing visible UI yet.

- [ ] Add the type contracts matching the backend API exactly.
- [ ] Run `npm run lint` and `npm run build` from `frontend/`.
- [ ] Commit the task.

## Verification

- `cd backend && pytest tests -q`
- `cd frontend && npm run lint && npm run build`
