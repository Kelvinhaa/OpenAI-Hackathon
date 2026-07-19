# Guest Retention Animation Design

## Goal

Make the guest FSRS dashboard feel more alive while explaining the illustrative average-human retention trend that spaced review is designed to improve.

## Scope

The feature lives only in the unauthenticated dashboard preview on `frontend/app/page.tsx`. It adds a retention panel, then applies restrained entrance motion to the preview's existing statistics, session rows, and stability bars. It does not alter the authenticated dashboard, backend contracts, or stored study data.

## Experience

The panel begins with a small eyebrow, then a `Retention level` heading springs into place. A large percentage settles in beside it. Five bars animate upward in a staggered sequence for Day 1, Day 3, Week 1, Week 2, and Month 1, representing an educational average-human retention trend. Supporting copy explicitly calls this an illustrative estimate rather than a learner-specific prediction.

The surrounding dashboard preview enters once, with statistics, session cards, and stability fills staggered subtly. Motion uses the existing warm, paper-like visual language and avoids dashboard-style visual noise.

## Technical Design

Use semantic HTML and CSS-only animations in `frontend/app/page.tsx` and `frontend/app/globals.css`; do not add animation or chart dependencies. Store the five static chart data points beside the guest-preview markup and render them as accessible labelled bars. CSS custom properties carry each bar height and sequence index.

`@media (prefers-reduced-motion: reduce)` disables transforms and animations while leaving all text, bar heights, and content immediately visible. The layout is responsive: the percentage and explanatory copy stay readable at narrow widths, while the five bars retain their labels.

## Validation

The homepage must compile and render as a guest. Lint and production build must pass. A browser check confirms the chart text is present, the page has no runtime errors, the animation runs on normal motion settings, and the completed visual state remains understandable with reduced motion enabled.
