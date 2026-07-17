# Root Contributor Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concise root-level contributor guide for the FastAPI and Next.js repository.

**Architecture:** The root `AGENTS.md` provides shared conventions and service commands. It links to `frontend/AGENTS.md` rather than duplicating its Next.js-specific requirements.

**Tech Stack:** Markdown, FastAPI, pytest, Next.js, TypeScript, ESLint, Playwright.

## Global Constraints

- Keep `AGENTS.md` between 200 and 400 words.
- Use `backend/` and `frontend/` as the repository's actual service directories.
- Do not prescribe tools, coverage targets, or processes absent from the repository.
- Do not include secrets; local configuration belongs in ignored environment files.

---

### Task 1: Create the root contributor guide

**Files:**
- Create: `AGENTS.md`
- Reference: `README.md`
- Reference: `frontend/AGENTS.md`
- Reference: `frontend/package.json`
- Reference: `backend/requirements.txt`

**Interfaces:**
- Consumes: service layout and commands recorded in the repository.
- Produces: root-level contributor guidance and a pointer to `frontend/AGENTS.md`.

- [ ] **Step 1: Write the guide**

Create `AGENTS.md` with the title `Repository Guidelines` and sections for
project structure, development commands, style, testing, commits and pull
requests, and configuration safety. Include commands using `cd backend` and
`cd frontend`; mention `pytest tests -q`, `npm run lint`, and `npm run build`.

- [ ] **Step 2: Check length and required sections**

Run: `wc -w AGENTS.md && rg -n '^#|backend/|frontend/|pytest tests -q|npm run lint|npm run build|frontend/AGENTS.md' AGENTS.md`

Expected: word count from 200 through 400; output shows the title, headings,
commands, directory references, and the nested guidance reference.

- [ ] **Step 3: Review for repository accuracy**

Run: `rg -n '"(dev|build|lint)"|testDir|E2E_EMAIL|E2E_PASSWORD' frontend/package.json frontend/playwright.config.ts README.md && rg -n 'pytest|uvicorn' backend/requirements.txt README.md`

Expected: the source files confirm every tool or command named by the guide.

- [ ] **Step 4: Commit when a repository commit history exists**

Run: `git add AGENTS.md && git commit -m "docs: add repository contributor guide"`

Expected: a documentation-only commit. Do not make this commit while the
repository remains without an initial commit unless the repository owner asks.
