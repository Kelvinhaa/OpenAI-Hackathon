# Root Contributor Guide Design

## Goal

Add a root-level `AGENTS.md` that gives contributors a quick, accurate guide to
the FastAPI and Next.js application without duplicating frontend-specific rules.

## Scope

The guide will describe the top-level repository layout, local development and
verification commands, coding and test conventions, pull-request expectations,
and configuration safety. It will point contributors working in `frontend/` to
the existing `frontend/AGENTS.md` for Next.js-specific instructions.

## Content Decisions

- Use `backend/` and `frontend/` as the canonical directories, matching the
  repository rather than stale `frontend-next/` references in `README.md`.
- List only scripts and tools present in the repository: Uvicorn, pytest, npm,
  ESLint, Next.js build, and Playwright configuration.
- Avoid invented coverage targets or release processes.
- Since the repository has no commits yet, recommend concise imperative commit
  subjects and PR descriptions that state validation performed; request
  screenshots for visible UI changes.
- Keep secrets in ignored local environment files and document the E2E
  credentials needed for browser tests.

## Validation

Check the document is 200–400 words, uses Markdown headings, and matches the
current directory names and available scripts.
