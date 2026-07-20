# OpenAI Hackathon MindMappr Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Education-track, signed-in study companion that generates a MindMappr-style study plan, visualises it as a learning map, gives formative retrieval feedback, and schedules concept-level FSRS-5 reviews.

**Architecture:** Adapt MindMappr's Next.js 16 + FastAPI + Supabase foundations into this workspace. `StudySession` remains the parent plan record; new concept-node, prerequisite-edge, and review-event records provide the map and per-concept FSRS state. The FastAPI service uses the OpenAI Responses API with structured Pydantic outputs for both plan/map generation and retrieval feedback.

**Tech Stack:** Next.js 16, React 19, TypeScript, @xyflow/react, Supabase Auth, FastAPI, SQLAlchemy, Alembic, PostgreSQL, Pydantic, OpenAI Python SDK, pytest, Playwright.

## Global Constraints

- Target school and university students through a responsive web app.
- Sign-in is mandatory; every study session, concept, edge, and review event is owner-scoped.
- Planner inputs are topic, duration in minutes, level, and optional goal. Do not add uploads or PDFs.
- Use `gpt-5.6-luna` through the Responses API structured-output interface with `reasoning={"effort": "low"}`; keep `OPENAI_API_KEY` server-side only.
- The first generation request must return the complete study plan and 4–6 concept map; do not persist partial output.
- The student, not the model, confirms the FSRS rating (`Again`, `Hard`, `Good`, `Easy`).
- Use the user-authorized OpenAI Hackathon MindMappr name and the warm-paper, Newsreader/IBM Plex Mono visual direction.
- All schema changes use Alembic. Frontend changes require visual browser verification.

---

## Planned file structure

```
backend/
  backends/
    models.py                         # StudySession plus concept, edge, and review-event ORM records
    schemas/study.py                  # Planner, map, feedback, review, and API response contracts
    services/study.py                 # FSRS-5 and OpenAI generation/feedback services
    routers/study.py                  # Authenticated study, feedback, and review endpoints
  alembic/versions/20260717_01_add_learning_maps.py
  tests/conftest.py                   # Isolated database, auth override, fake model-service fixtures
  tests/test_fsrs.py                  # Concept-level FSRS unit tests
  tests/test_study_service.py         # Schema and model-service tests
  tests/test_study_routes.py          # Auth, persistence, feedback, and queue tests
frontend-next/
  app/page.tsx                        # MindMappr-style planner and generated-plan handoff
  app/map/[studyId]/page.tsx          # Protected map route
  app/map/[studyId]/MapWorkspace.tsx  # Fetching, map state, and detail-panel orchestration
  app/components/LearningMapCanvas.tsx # Read-only interactive graph
  app/components/ConceptPanel.tsx     # Explanation, mastery, and next-review panel
  app/components/RecallCheck.tsx      # Answer, AI feedback, and confirmed-rating controls
  app/library/page.tsx                # Saved-map library
  app/review/ReviewClient.tsx         # Due concept queue and review flow
  app/components/TopNav.tsx           # Map navigation entry
  types/study.ts                      # Shared frontend API types
  package.json                        # Graph and browser-test commands/dependencies
  playwright.config.ts
  tests/e2e/auth.setup.ts             # Logs in with local E2E credentials and saves storage state
  tests/e2e/learning-flow.spec.ts
README.md                             # Local setup, demo account/data, architecture, and GPT-5.6/Codex story
```

### Task 1: Establish the adapted project and test baselines

**Files:**
- Create: `backend/tests/conftest.py`, `frontend-next/playwright.config.ts`, `frontend-next/tests/e2e/auth.setup.ts`, `frontend-next/tests/e2e/learning-flow.spec.ts`
- Modify: `backend/requirements.txt`, `frontend-next/package.json`, `frontend-next/proxy.ts`, `README.md`, `.gitignore`
- Copy into this workspace: `/Users/havanthien/Personal_Project/Mindmappr/backend/` and `/Users/havanthien/Personal_Project/Mindmappr/frontend-next/` excluding `.venv/` and `node_modules/`

**Interfaces:**
- Produces a runnable baseline at `backend/` and `frontend-next/` with `pytest` and Playwright commands.
- Defines `TEST_USER_ID = "00000000-0000-0000-0000-000000000001"` for all authenticated route tests.

- [ ] **Step 1: Initialize the new repository and copy only reusable application code.**

```bash
git init
rsync -a --exclude .git --exclude .venv --exclude node_modules --exclude mindmappr.db \
  /Users/havanthien/Personal_Project/Mindmappr/backend/ backend/
rsync -a --exclude .git --exclude node_modules \
  /Users/havanthien/Personal_Project/Mindmappr/frontend-next/ frontend-next/
```

- [ ] **Step 2: Add the development test dependencies and scripts.**

Append `pytest`, `pytest-asyncio`, and `httpx` to `backend/requirements.txt`. Install the graph and browser-test dependencies with:

```bash
cd frontend-next
npm install @xyflow/react
npm install -D @playwright/test
npx playwright install chromium
```

Add these scripts to `frontend-next/package.json`:

```json
{
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
}
```

- [ ] **Step 3: Add the failing health and browser smoke tests.**

`backend/tests/conftest.py` must set test environment variables before importing the application, use a temporary SQLite database, override `get_db`, and override `get_current_user_id` with `TEST_USER_ID`. Add this first route test:

```python
def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

Add `frontend-next/tests/e2e/learning-flow.spec.ts` with a first failing page assertion:

```ts
import { expect, test } from "@playwright/test";

test("planner presents the four study inputs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("What are you studying?")).toBeVisible();
  await expect(page.getByLabel("Study Duration")).toBeVisible();
  await expect(page.getByLabel("Your Level")).toBeVisible();
  await expect(page.getByLabel("Learning Goal")).toBeVisible();
});
```

Add `frontend-next/tests/e2e/auth.setup.ts` that logs into the local Supabase test user using `E2E_EMAIL` and `E2E_PASSWORD`, then saves `playwright/.auth/user.json`. Configure `playwright.config.ts` with a setup project and a Chromium project that uses this storage state. Add `playwright/.auth/` and `.superpowers/` to `.gitignore`.

- [ ] **Step 4: Run the baseline checks.**

Run: `cd backend && pytest tests -q`

Expected: health test passes once fixtures are wired; no external database or model request is made.

Run: `cd frontend-next && npm run lint && npm run build`

Expected: both exit with code 0 before map work begins.

- [ ] **Step 5: Commit the baseline.**

```bash
git add backend frontend-next README.md .gitignore
git commit -m "chore: initialize learning map app"
```

### Task 2: Model learning maps and concept-level FSRS state

**Files:**
- Modify: `backend/backends/models.py`, `backend/backends/schemas/study.py`
- Create: `backend/alembic/versions/20260717_01_add_learning_maps.py`, `backend/tests/test_study_models.py`

**Interfaces:**
- Produces ORM records `ConceptNode`, `ConceptEdge`, and `ConceptReviewEvent` attached to `StudySession`.
- Produces Pydantic types `GeneratedLearningExperience`, `ConceptNodeResponse`, `ConceptEdgeResponse`, `RetrievalFeedbackRequest`, `RetrievalFeedbackResponse`, `ConceptReviewRequest`, and `ConceptReviewResponse`.

- [ ] **Step 1: Write failing schema and relationship tests.**

```python
def test_generated_experience_rejects_edges_to_missing_nodes():
    with pytest.raises(ValidationError):
        GeneratedLearningExperience.model_validate({
            "summary": "Plan", "techniques": [], "tips": [],
            "concepts": [{"key": "dna", "title": "DNA", "explanation": "x", "retrieval_prompt": "y"}] * 4,
            "edges": [{"prerequisite_key": "missing", "dependent_key": "dna"}],
        })

def test_concept_node_belongs_to_one_study_session(db_session, study_session):
    node = ConceptNode(study_session_id=study_session.id, key="mitosis", title="Mitosis",
                       explanation="Cell division", retrieval_prompt="What is mitosis?")
    db_session.add(node)
    db_session.commit()
    assert node.study_session_id == study_session.id
```

- [ ] **Step 2: Add the domain records and migration.**

Add relationships from `StudySession` to `concepts`, `edges`, and `review_events` with `cascade="all, delete-orphan"`. Create these columns:

```python
class ConceptNode(Base):
    __tablename__ = "concept_nodes"
    id = Column(Integer, primary_key=True)
    study_session_id = Column(Integer, ForeignKey("study_sessions.id"), nullable=False, index=True)
    key = Column(String, nullable=False)
    title = Column(String, nullable=False)
    explanation = Column(String, nullable=False)
    retrieval_prompt = Column(String, nullable=False)
    last_reviewed_at = Column(DateTime(timezone=True))
    next_review_at = Column(DateTime(timezone=True), index=True)
    review_count = Column(Integer, nullable=False, server_default="0")
    interval_days = Column(Integer, nullable=False, server_default="1")
    stability = Column(Float, nullable=False, server_default="0")
    difficulty = Column(Float, nullable=False, server_default="0")
    last_rating = Column(Integer)
```

`ConceptEdge` stores `study_session_id`, `prerequisite_node_id`, and `dependent_node_id`; `ConceptReviewEvent` stores `concept_node_id`, `rating`, `answer`, and `reviewed_at`. Add database uniqueness for `(study_session_id, key)` and a check constraint preventing an edge from connecting a node to itself.

`GeneratedLearningExperience` must enforce 4–6 unique concept keys, non-empty explanations/prompts, no self-edge, and edges whose keys exist in the concept set.

- [ ] **Step 3: Generate and apply the migration.**

Create `backend/alembic/versions/20260717_01_add_learning_maps.py` with `revision = "20260717_01"`, its current head as `down_revision`, and the three table definitions above. Then run: `cd backend && alembic upgrade head`

Expected: PostgreSQL gains `concept_nodes`, `concept_edges`, and `concept_review_events`; existing `study_sessions` rows remain valid.

- [ ] **Step 4: Run model/schema tests.**

Run: `cd backend && pytest tests/test_study_models.py -q`

Expected: PASS; invalid maps are rejected before persistence.

- [ ] **Step 5: Commit the data model.**

```bash
git add backend/backends/models.py backend/backends/schemas/study.py backend/alembic backend/tests/test_study_models.py
git commit -m "feat: add learning map data model"
```

### Task 3: Preserve and test FSRS-5 at the concept level

**Files:**
- Modify: `backend/backends/services/study.py`
- Create: `backend/tests/test_fsrs.py`

**Interfaces:**
- Produces `apply_fsrs(stability, difficulty, review_count, rating, elapsed_days) -> tuple[int, float, float]` and `concept_mastery_state(node) -> Literal["new", "needs_work", "growing", "mastered"]`.
- `ConceptReviewResponse` exposes `interval_days`, `stability`, `difficulty`, `next_review_at`, and `mastery_state`.

- [ ] **Step 1: Write failing transition tests.**

```python
def test_first_easy_review_creates_a_longer_interval_than_again():
    again = apply_fsrs(0, 0, 0, rating=1)
    easy = apply_fsrs(0, 0, 0, rating=4)
    assert easy[0] > again[0]
    assert easy[1] > again[1]

def test_again_reduces_stability_after_a_previous_review():
    _, stable, difficulty = apply_fsrs(0, 0, 0, rating=4)
    _, after_again, _ = apply_fsrs(stable, difficulty, 1, rating=1, elapsed_days=7)
    assert after_again < stable
```

- [ ] **Step 2: Make the scheduler independent of `StudySession`.**

Keep the existing FSRS-5 weights and pure functions. Remove scheduler reads/writes from the parent session path; use `ConceptNode.stability` and `ConceptNode.difficulty` when the review endpoint persists a rating. Define mastery deterministically:

```python
def concept_mastery_state(node: ConceptNode) -> str:
    if node.review_count == 0:
        return "new"
    if node.stability < 2 or node.last_rating in (1, 2):
        return "needs_work"
    if node.review_count < 3 or node.stability < 7:
        return "growing"
    return "mastered"
```

Store `last_rating` on `ConceptNode` in the Task 2 migration so this function has no query-side ambiguity.

- [ ] **Step 3: Run the scheduler tests.**

Run: `cd backend && pytest tests/test_fsrs.py -q`

Expected: PASS; ratings always create an interval of at least one day and a difficulty in `[1, 10]`.

- [ ] **Step 4: Commit the scheduler boundary.**

```bash
git add backend/backends/services/study.py backend/backends/models.py backend/alembic backend/tests/test_fsrs.py
git commit -m "feat: schedule reviews by concept"
```

### Task 4: Generate plans and maps with GPT-5.6 structured output

**Files:**
- Modify: `backend/requirements.txt`, `backend/backends/services/study.py`, `backend/backends/routers/study.py`, `backend/backends/schemas/study.py`, `backend/tests/test_study_service.py`, `backend/tests/test_study_routes.py`

**Interfaces:**
- `async generate_learning_experience(subject: str, level: str, time: int, goal: str | None) -> GeneratedLearningExperience`
- `POST /study` accepts existing `StudyRequest` and returns `StudyResponse` containing `recommendation`, `concepts`, and `edges`.
- API failure is `502 {"detail": "Learning map generation is temporarily unavailable. Please try again."}` and creates no database rows.

- [ ] **Step 1: Write the failing creation and rollback tests.**

```python
async def test_create_study_persists_plan_concepts_and_edges(client, fake_learning_service):
    response = client.post("/study", json={"subject": "Cell division", "time": 45,
                                             "level": "intermediate", "goal": "Prepare for quiz"})
    body = response.json()
    assert response.status_code == 200
    assert len(body["concepts"]) == 4
    assert body["concepts"][0]["retrieval_prompt"]
    assert body["edges"]

async def test_generation_error_returns_502_without_storing_session(client, failing_learning_service, db_session):
    response = client.post("/study", json={"subject": "Cell division", "time": 45,
                                             "level": "intermediate"})
    assert response.status_code == 502
    assert db_session.query(StudySession).count() == 0
```

- [ ] **Step 2: Replace Anthropic with the OpenAI SDK and typed output.**

Replace `anthropic` with `openai` in `backend/requirements.txt`; replace `ANTHROPIC_API_KEY` with `OPENAI_API_KEY` in `.env.example` and README. Use `AsyncOpenAI` and the Responses structured parser:

```python
client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
response = await client.responses.parse(
    model="gpt-5.6-luna",
    reasoning={"effort": "low"},
    input=[
        {"role": "system", "content": LEARNING_MAP_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ],
    text_format=GeneratedLearningExperience,
)
experience = response.output_parsed
if experience is None:
    raise LearningGenerationError()
return experience
```

The system prompt must require a subject-specific plan whose technique durations total the requested minutes, 4–6 concepts, stable lowercase concept keys, prerequisite-to-dependent edges, and one answerable retrieval prompt per concept.

- [ ] **Step 3: Persist only validated generation output.**

In `create_study`, call generation before opening the persistence sequence; then create one `StudySession`, map each concept key to one `ConceptNode`, create edges only after resolving both keys, and commit once. Return concepts/edges in a deterministic `order_by(ConceptNode.id)` order.

- [ ] **Step 4: Run service and route tests.**

Run: `cd backend && pytest tests/test_study_service.py tests/test_study_routes.py -q`

Expected: PASS; tests mock `generate_learning_experience` and make no network request.

- [ ] **Step 5: Commit OpenAI generation.**

```bash
git add backend/requirements.txt backend/backends backend/tests README.md
git commit -m "feat: generate learning plans and maps"
```

### Task 5: Add formative feedback, owner-scoped reviews, and the due queue

**Files:**
- Modify: `backend/backends/services/study.py`, `backend/backends/routers/study.py`, `backend/backends/schemas/study.py`, `backend/tests/test_study_service.py`, `backend/tests/test_study_routes.py`

**Interfaces:**
- `POST /study/concepts/{concept_id}/feedback` accepts `{"answer": str}` and returns `{feedback, suggested_rating, prerequisite_concept_id?}` without mutation.
- `POST /study/concepts/{concept_id}/review` accepts `{"rating": 1|2|3|4, "answer": str}` and returns `ConceptReviewResponse`.
- `GET /study/review-queue` returns due `ConceptNodeResponse` objects ordered by `next_review_at ASC`.

- [ ] **Step 1: Write failing feedback, ownership, and queue tests.**

```python
def test_feedback_does_not_change_fsrs_state(client, concept_node, fake_feedback_service):
    before = (concept_node.review_count, concept_node.stability)
    response = client.post(f"/study/concepts/{concept_node.id}/feedback", json={"answer": "It makes two cells"})
    concept_node = reload(concept_node)
    assert response.status_code == 200
    assert (concept_node.review_count, concept_node.stability) == before

def test_review_rejects_a_concept_owned_by_another_user(client, other_users_concept):
    response = client.post(f"/study/concepts/{other_users_concept.id}/review", json={"rating": 3, "answer": "answer"})
    assert response.status_code == 404
```

- [ ] **Step 2: Implement bounded GPT feedback.**

Create `async evaluate_retrieval_answer(concept, answer) -> RetrievalFeedbackResponse` using `client.responses.parse(..., text_format=RetrievalFeedbackResponse)`. Its prompt must return: a two-sentence maximum explanation of what is correct/missing, `suggested_rating` in `1..4`, and an optional prerequisite concept key only when the answer misses a prerequisite. Do not let the model write to the database or override the student rating.

- [ ] **Step 3: Implement review persistence.**

Fetch `ConceptNode` through a join to `StudySession` constrained by `StudySession.user_id == user_id`. Calculate elapsed days from `last_reviewed_at`, call `apply_fsrs`, set `last_rating`, create `ConceptReviewEvent`, update FSRS fields, set `next_review_at = now + timedelta(days=interval_days)`, then commit once. The queue includes nodes that have `next_review_at <= now`; newly generated concepts are not queued until the student completes their first recall check.

- [ ] **Step 4: Run the focused backend suite.**

Run: `cd backend && pytest tests/test_study_service.py tests/test_study_routes.py tests/test_fsrs.py -q`

Expected: PASS; another user receives 404 for both feedback and review endpoints.

- [ ] **Step 5: Commit the learning loop.**

```bash
git add backend/backends backend/tests
git commit -m "feat: add recall feedback and concept reviews"
```

### Task 6: Preserve the MindMappr planner and hand off to a map

**Files:**
- Modify: `frontend-next/app/page.tsx`, `frontend-next/types/study.ts`, `frontend-next/app/components/TopNav.tsx`, `frontend-next/app/globals.css`, `frontend-next/proxy.ts`
- Test: `frontend-next/tests/e2e/learning-flow.spec.ts`

**Interfaces:**
- `StudyResponse` includes `concepts: ConceptNode[]` and `edges: ConceptEdge[]`.
- Successful `POST /study` renders the plan beside the composer and a link to `/map/{id}`.

- [ ] **Step 1: Extend the failing browser test through generation.**

Mock `POST /study` in Playwright and add:

```ts
await page.getByLabel("What are you studying?").fill("Cell division");
await page.getByLabel("Study Duration").fill("45");
await page.getByLabel("Your Level").selectOption("intermediate");
await page.getByRole("button", { name: "Generate study plan" }).click();
await expect(page.getByRole("heading", { name: "Your Study Plan" })).toBeVisible();
await expect(page.getByRole("link", { name: "Open learning map" })).toHaveAttribute("href", /\/map\/\d+$/);
```

- [ ] **Step 2: Adapt, rather than replace, the existing composer.**

Keep the exact topic, duration, level, and optional goal fields in `app/page.tsx`; require an authenticated Supabase session before submission; change the primary label to `Generate study plan`; remove guest preview handling. Render generated plan summary, techniques, and tips in the existing results panel plus an `Open learning map` link. Update `proxy.ts` so `/`, `/map`, `/review`, `/dashboard`, and `/library` are protected paths; keep only `/login`, `/register`, and `/auth/callback` public.

- [ ] **Step 3: Update navigation and visual tokens.**

Replace MindMappr-specific marks/wordmark with an original text wordmark. Add `Planner`, `Library`, and `Review` navigation plus contextual `Learning map` navigation only when a map is open. Retain warm paper variables, serif learning copy, mono metadata, orange primary action, shallow elevation, and rounded rectangles.

- [ ] **Step 4: Run and visually verify the planner.**

Run: `cd frontend-next && npm run lint && npm run build && npm run test:e2e -- --grep "planner"`

Expected: PASS. Start the app and capture desktop plus mobile screenshots; check that the plan panel does not overlap the composer at 375px width.

- [ ] **Step 5: Commit the planner handoff.**

```bash
git add frontend-next/app frontend-next/types frontend-next/tests frontend-next/package.json
git commit -m "feat: connect planner to learning maps"
```

### Task 7: Build the map-first studio and recall interaction

**Files:**
- Create: `frontend-next/app/map/[studyId]/page.tsx`, `frontend-next/app/map/[studyId]/MapWorkspace.tsx`, `frontend-next/app/components/LearningMapCanvas.tsx`, `frontend-next/app/components/ConceptPanel.tsx`, `frontend-next/app/components/RecallCheck.tsx`
- Modify: `frontend-next/app/globals.css`, `frontend-next/types/study.ts`, `frontend-next/tests/e2e/learning-flow.spec.ts`

**Interfaces:**
- `LearningMapCanvas({ concepts, edges, selectedConceptId, onSelect })` renders prerequisite edges and emits selected concept IDs.
- `ConceptPanel({ concept, onFeedback, onReview })` owns no API calls; `MapWorkspace` owns the authenticated fetch and mutations.
- `RecallCheck` calls feedback first, displays the suggested rating, then sends only the user-confirmed rating to review.

- [ ] **Step 1: Write the failing interactive map test.**

```ts
test("student receives feedback then confirms a rating", async ({ page }) => {
  await page.goto("/map/1");
  await page.getByRole("button", { name: "Mitosis" }).click();
  await page.getByLabel("Your explanation").fill("It creates two identical cells.");
  await page.getByRole("button", { name: "Check recall" }).click();
  await expect(page.getByText("Suggested rating")).toBeVisible();
  await page.getByRole("button", { name: "Good" }).click();
  await expect(page.getByText(/Next review/)).toBeVisible();
});
```

- [ ] **Step 2: Render a small, readable graph.**

Use `@xyflow/react` in `LearningMapCanvas`. Convert API concepts to map nodes with `id = String(concept.id)` and label `concept.title`; convert each prerequisite edge to `{ source: String(prerequisite_node_id), target: String(dependent_node_id) }`. Compute a stable left-to-right layout by concept depth so the model never controls arbitrary pixel positions. Use mastery states for subtle node tint and badge text, never a heavy colored left border.

- [ ] **Step 3: Implement the three-column workspace.**

`MapWorkspace` fetches `GET /study/{studyId}` with the Supabase bearer token, selects the first concept by default, and renders: left saved-map/context rail, central canvas, right detail panel. At narrow widths, turn rails into stacked sections above/below the canvas; the canvas must retain horizontal pan/zoom.

- [ ] **Step 4: Implement feedback-before-rating.**

`RecallCheck` posts `{ answer }` to `/study/concepts/{id}/feedback`, renders the short feedback and the suggested rating, then renders four explicit confirmation buttons. Its selected button posts `{ answer, rating }` to `/study/concepts/{id}/review`; update that concept in local state with the response instead of refetching the full map.

- [ ] **Step 5: Run UI checks and browser verification.**

Run: `cd frontend-next && npm run lint && npm run build && npm run test:e2e -- --grep "student receives feedback"`

Expected: PASS. Capture desktop and 375px screenshots after a `Good` rating; verify visible map mastery state and next-review date.

- [ ] **Step 6: Commit the map workspace.**

```bash
git add frontend-next/app frontend-next/types frontend-next/tests frontend-next/package.json frontend-next/package-lock.json
git commit -m "feat: add interactive learning map"
```

### Task 8: Adapt Library and Review to concept-level progress

**Files:**
- Modify: `frontend-next/app/library/page.tsx`, `frontend-next/app/review/ReviewClient.tsx`, `frontend-next/types/study.ts`, `frontend-next/app/globals.css`
- Test: `frontend-next/tests/e2e/learning-flow.spec.ts`

**Interfaces:**
- Library lists study sessions with `concept_count`, `due_concept_count`, and a link to `/map/{studyId}`.
- `GET /study/review-queue` returns concept-level due items with parent study topic and retrieval prompt.

- [ ] **Step 1: Write failing Library and Review browser assertions.**

```ts
test("library opens a saved map and review shows due concepts", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("link", { name: "Open Cell division map" }).click();
  await expect(page).toHaveURL(/\/map\/1$/);
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Due for review" })).toBeVisible();
  await expect(page.getByText("Why does mitosis create identical cells?")).toBeVisible();
});
```

- [ ] **Step 2: Replace session recall summaries with map and concept summaries.**

In Library, preserve search and warm card styling but show map topic, level, concept count, due concept count, and an `Open {topic} map` link. In Review, display one concept’s title, parent topic, retrieval prompt, answer field, feedback, and confirmed rating controls. Reuse `RecallCheck` so map and review cannot diverge in rating behavior.

- [ ] **Step 3: Verify the full frontend path.**

Run: `cd frontend-next && npm run lint && npm run build && npm run test:e2e`

Expected: PASS; all tests use mocked API responses and no real OpenAI API key.

- [ ] **Step 4: Commit the review experience.**

```bash
git add frontend-next/app frontend-next/types frontend-next/tests
git commit -m "feat: review concepts from due queue"
```

### Task 9: Make the project judge-ready

**Files:**
- Modify: `README.md`, `backend/.env.example`, `frontend-next/.env.example`, `backend/backends/main.py`, `frontend-next/app/layout.tsx`
- Create: `docs/demo-script.md`, `docs/sample-data/cell-division.json`

**Interfaces:**
- README supplies exact local setup, test commands, environment variables, seed data, app walkthrough, and a short `How we used Codex and GPT-5.6` section.
- `docs/demo-script.md` is a narrated three-minute recording checklist.

- [ ] **Step 1: Add a failing configuration check.**

```python
def test_missing_openai_key_fails_generation_without_exposing_secrets(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = client.post("/study", json={"subject": "Mitosis", "time": 30, "level": "beginner"})
    assert response.status_code == 502
    assert "OPENAI_API_KEY" not in response.text
```

- [ ] **Step 2: Finalize runtime configuration and copy.**

Set FastAPI title and Next metadata to `OpenAI Hackathon MindMappr`. Configure `CORS_ORIGINS` for the deployed frontend, retain explicit origins, and document `OPENAI_API_KEY`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_API_URL`. Do not commit live values.

- [ ] **Step 3: Write judge-facing documentation and seed data.**

The README must include:

```markdown
## Demo path
1. Sign in with the supplied demo account or create an account.
2. Generate "Cell division" at intermediate level for 45 minutes.
3. Open the learning map, answer the Mitosis check, choose Good, then visit Review.

## Built with Codex and GPT-5.6
Codex accelerated the frontend, API, database migration, tests, and documentation.
GPT-5.6 produces the structured study plan/map and concise formative retrieval feedback through the Responses API.
```

The demo script allocates 20 seconds to problem, 45 seconds planner/generation, 55 seconds map/feedback, 25 seconds FSRS/review queue, and 25 seconds to Codex/GPT-5.6 implementation story.

- [ ] **Step 4: Run final verification.**

Run:

```bash
cd backend && pytest tests -q
cd ../frontend-next && npm run lint && npm run build && npm run test:e2e
```

Expected: all commands exit 0. Then run the deployed demo using `docs/sample-data/cell-division.json`, capture the full recording, and confirm the README's setup instructions from a clean environment.

- [ ] **Step 5: Commit the submission package.**

```bash
git add README.md backend/.env.example frontend-next/.env.example backend frontend-next docs
git commit -m "docs: prepare hackathon submission"
```

## Plan self-review

- Spec coverage: Tasks 2–5 implement structured plan/map generation, node-level feedback, ownership, and FSRS; Tasks 6–8 implement Planner, Map, Library, and Review; Task 9 covers deployment, README, demo, and Build Week evidence.
- No-placeholder scan: all database records, endpoints, test names, response behavior, and verification commands are named explicitly.
- Type consistency: `StudySession` is the parent resource; `ConceptNode` owns FSRS state; feedback is non-mutating; review is the only endpoint that creates a `ConceptReviewEvent` and updates FSRS state.
