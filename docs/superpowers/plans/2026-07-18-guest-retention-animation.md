# Guest Retention Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible animated average-human retention chart and subtle entrance motion to the guest study dashboard preview.

**Architecture:** Keep the feature in the anonymous FSRS preview already rendered by `frontend/app/page.tsx`. Render static, labelled retention data as semantic markup and let `frontend/app/globals.css` own layout, animation timing, responsive behavior, and reduced-motion behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS.

## Global Constraints

- Do not add dependencies.
- Do not change authenticated-dashboard, backend, or API behavior.
- Explain that values are illustrative average-human retention estimates, not individual predictions.
- Use CSS-only motion and honor `prefers-reduced-motion: reduce`.

---

### Task 1: Render accessible retention-trend markup

**Files:**
- Modify: `frontend/app/page.tsx` in the unauthenticated `.demo-card` preview
- Test: browser check of `/` as a signed-out visitor

**Interfaces:**
- Consumes: the existing guest-only `!accessToken` preview condition.
- Produces: a `retention-trend` section with five labelled `.retention-bar` items and per-bar `--retention-height` and `--bar-index` custom properties.

- [ ] **Step 1: Establish the baseline**

Run: `cd frontend && npm run lint`

Expected: exit code 0 before the UI change.

- [ ] **Step 2: Add the static trend data and semantic panel**

Add this data near the existing guest-preview JSX:

```ts
const retentionTrend = [
  { label: "Day 1", value: 42 },
  { label: "Day 3", value: 51 },
  { label: "Week 1", value: 63 },
  { label: "Week 2", value: 74 },
  { label: "Month 1", value: 86 },
];
```

Render a `section` with `aria-labelledby="retention-title"`, a `Retention level` heading, an `86%` summary, explanatory copy, and labelled bars. Set `style={{ "--retention-height": `${point.value}%`, "--bar-index": index } as React.CSSProperties}` on each bar wrapper.

- [ ] **Step 3: Verify the static panel**

Run: `cd frontend && npm run lint && npm run build`

Expected: exit code 0; no TypeScript error from the CSS custom-property style object.

### Task 2: Style and animate the guest dashboard preview

**Files:**
- Modify: `frontend/app/globals.css` after the existing demo-dashboard rules
- Test: browser check of `/` with standard and reduced-motion preferences

**Interfaces:**
- Consumes: `.retention-trend`, `.retention-bar`, `--retention-height`, and `--bar-index` from Task 1.
- Produces: responsive retention chart styles, staggered one-time animations, and a motion-free reduced-motion presentation.

- [ ] **Step 1: Add a static readable chart layout**

Style the panel as a warm card inset with a two-column heading and metric area. Use a fixed chart baseline, grid-distributed bars, and labels beneath each bar. The bar fill height must use `var(--retention-height)` so the final static state displays correctly without animation.

- [ ] **Step 2: Add measured entrance motion**

Create a spring-like `retentionTitleIn` keyframe for `Retention level`, `retentionMetricIn` for the summary percentage, and `retentionBarRise` for bar fills. Use `animation-delay: calc(var(--bar-index) * 90ms)` for a left-to-right chart sequence. Add low-distance, one-time staggered motion for `.demo-stat`, `.demo-session`, and `.demo-stability-fill`.

- [ ] **Step 3: Add the accessibility fallback**

Add a `@media (prefers-reduced-motion: reduce)` block that sets `animation: none` and `transition: none` for the guest-preview motion selectors, keeps opacity at `1`, removes transforms, and sets the fills to their final visible height or width.

- [ ] **Step 4: Verify the presentation**

Run: `cd frontend && npm run lint && npm run build`

Expected: exit code 0. Open the signed-out homepage and verify the heading, 86% metric, five labels, chart bars, and explanatory estimate copy are visible.

### Task 3: Verify the running local experience

**Files:**
- Modify: none
- Test: local frontend server and browser inspection

**Interfaces:**
- Consumes: Tasks 1 and 2 completed in the local checkout.
- Produces: evidence that the guest preview renders without a frontend or API regression.

- [ ] **Step 1: Start the frontend and backend if they are not already running**

Run: `cd backend && source .venv/bin/activate && uvicorn backends.main:app --port 8000` and `cd frontend && npm run dev`.

Expected: FastAPI listens on port 8000 and Next.js reports its chosen local port.

- [ ] **Step 2: Verify the guest page**

Run: `curl -fsS -o /dev/null -w 'homepage=%{http_code}\\n' http://localhost:<next-port>/`

Expected: `homepage=200`.

- [ ] **Step 3: Inspect the user-facing result**

In a signed-out browser, open `/`, scroll to `How spaced repetition works`, and check that the retention animation is legible on desktop and narrow mobile width. Enable reduced motion and repeat the check; the same final content must appear without animated movement.
