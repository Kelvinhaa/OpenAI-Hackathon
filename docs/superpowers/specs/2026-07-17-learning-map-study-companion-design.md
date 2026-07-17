# OpenAI Hackathon MindMappr — Design

## Product summary

Build an Education-track web app that extends the MindMappr study-planning pattern into a visual mastery workspace. A signed-in student enters a topic, available study time, level, and optional goal. The app creates a personalised study plan plus a learning map whose concepts are taught, checked through retrieval practice, and scheduled for review with FSRS-5.

The project is differentiated by making understanding visible: a recall response receives concise AI feedback, the affected map concept reflects its mastery state, and the student sees exactly what to review next.

## User journey

1. The student signs in.
2. In the Planner, they enter topic, study duration, level, and optional goal.
3. Generation returns a plan (summary, time-boxed techniques, tips) and an initial learning map with 4–6 concepts, prerequisite edges, short explanations, and retrieval prompts.
4. The Map workspace is the primary experience. Selecting a node shows its explanation, retrieval prompt, current mastery, and next review date.
5. The student answers a short retrieval question. AI returns short formative feedback and a suggested recall rating; the student confirms `Again`, `Hard`, `Good`, or `Easy`.
6. FSRS-5 updates node-level stability, difficulty, interval, and due date. Library lists saved maps; Review presents the concepts due today.

## Scope

### Must ship

- Required authentication and per-user ownership.
- Planner with topic, duration, level, and goal inputs; no document upload.
- Structured AI generation of a study plan and map in one request.
- Interactive map, concept detail panel, retrieval feedback, rating controls, and per-node FSRS-5 scheduling.
- Library and distraction-free due-review flow.
- Responsive web experience with an original map UI.
- Seeded demo account/data, deployment, and README with setup plus testing instructions.

### Out of scope

- PDF/file ingestion, manual graph editing, collaboration, teacher features, notifications, social sharing, and full analytics.

## Design system

Use the user-authorized OpenAI Hackathon MindMappr name and a MindMappr-derived visual language: warm paper surfaces, shallow cards, orange action accent, rounded rectangular controls, Newsreader-style serif for learning content, and IBM Plex Mono-style metadata/actions. The map-first three-column studio contains a map library, central canvas, and concept/mastery detail panel.

## Technical design

- Adapt MindMappr's Next.js/React client, Supabase authentication, PostgreSQL persistence, FastAPI boundary, ownership checks, rate limiting, and pure FSRS-5 implementation.
- Replace the Claude generation service with an OpenAI GPT-5.6-backed structured generation layer. A second bounded call evaluates a retrieval response and returns feedback plus an optional suggested rating; the student remains the final rater.
- Keep a parent study session, then store a learning map, concept nodes, prerequisite edges, node review state, and review events. FSRS state belongs to a concept node rather than the whole session.
- Validate structured model output before persistence. On malformed or failed generation, show a retryable error and save nothing partial.
- Restrict every map, node, and review route to its authenticated owner. Keep model credentials server-side and rate-limit generation and feedback endpoints.

## Core interfaces

- `POST /study`: accepts `{ topic, duration_minutes, level, goal? }`; returns a saved plan and learning map for the authenticated user.
- `GET /maps/:id`: returns a user-owned map with nodes, edges, and node review state.
- `POST /nodes/:id/feedback`: accepts a retrieval response; returns concise feedback and suggested rating without mutating FSRS state.
- `POST /nodes/:id/review`: accepts confirmed rating; applies FSRS-5 and returns updated due state.
- `GET /review-queue`: returns only the user's due concept nodes.

Exact route naming may follow the adapted codebase's existing convention; input/output behaviour is fixed.

## Verification

- Unit tests for FSRS-5 rating transitions, stability/difficulty updates, and due-date calculation.
- Schema tests for valid and invalid model outputs.
- Integration tests for auth ownership, plan/map creation, retrieval feedback, review submission, and due-queue filtering.
- One end-to-end browser flow: sign in → generate a plan/map → answer a node → rate it → confirm the map and review state update.

## Submission strategy

Submit under Education. The narrated (<3 minute) demo shows the static-plan problem, topic/level/goal planner, generated plan and map, a recall response with feedback, FSRS scheduling, and the Review queue. The voiceover explicitly covers how Codex accelerated development and how GPT-5.6 powers plan/map generation and formative feedback. Include the public/runnable app, repository, README, and the required Codex `/feedback` session ID.

## Assumptions

- The initial release is a responsive web app for school and university students.
- The existing MindMappr codebase is available as an internal implementation reference and can be adapted.
- Product name: OpenAI Hackathon MindMappr.
