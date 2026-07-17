import type { ReviewQueueItem, StudyResponse } from "@/types/study";

export function formatNextReview(iso: string | null | undefined): string {
  if (!iso) return "Not scheduled";
  const diffDays = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

export function formatIntervalDays(days: number): string {
  if (days < 1) return "< 1 day";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

export function stabilityPct(stability: number): number {
  return Math.min(100, Math.round((stability / 30) * 100));
}

export function urgencyCardClass(item: ReviewQueueItem): string {
  return item.days_overdue > 1
    ? "session-card session-card--overdue paper-texture"
    : "session-card session-card--due paper-texture";
}

export function urgencyBadge(item: ReviewQueueItem): { cls: string; label: string } {
  if (!item.next_review_at) return { cls: "due-badge due-badge--today", label: "New — review now" };
  if (item.days_overdue > 1) return { cls: "due-badge due-badge--overdue", label: `${Math.floor(item.days_overdue)}d overdue` };
  return { cls: "due-badge due-badge--today", label: "Due today" };
}

/* ─────────────────────────────────────────────
   FSRS memory model (mirrors backend services/study.py)
   R(t) = (1 + FACTOR * t / S) ^ DECAY
───────────────────────────────────────────── */

const DECAY = -0.5;
const FACTOR = 0.2346; // 0.9 ** (1 / DECAY) - 1

// Decay-state cutoffs (tunable). Chosen to reproduce the Library mockup buckets.
const FRESH_MIN = 0.85;
const HOLDING_MIN = 0.6;

export type DecayState = "fading" | "holding" | "fresh";

/** Probability of recall (0–1) for a memory of `stability` days, `elapsed` days after review. */
export function retrievability(stability: number, elapsed: number): number {
  if (stability <= 0) return 0;
  return (1 + (FACTOR * elapsed) / stability) ** DECAY;
}

/** Days since the session was last reviewed, falling back to creation (matches backend). */
export function elapsedDays(s: StudyResponse): number {
  const anchor = s.last_reviewed_at ?? s.created_at;
  if (!anchor) return 0;
  return Math.max(0, (Date.now() - new Date(anchor).getTime()) / 86400000);
}

/** Current recall probability (0–1) for a study session. */
export function recallNow(s: StudyResponse): number {
  return retrievability(s.stability, elapsedDays(s));
}

/** Bucket a recall probability into a memory decay state. */
export function decayState(recall: number): DecayState {
  if (recall >= FRESH_MIN) return "fresh";
  if (recall >= HOLDING_MIN) return "holding";
  return "fading";
}

/** Human "reviewed X ago" label from the last-review anchor. */
export function reviewedAgo(s: StudyResponse): string {
  const anchor = s.last_reviewed_at ?? s.created_at;
  if (!anchor) return "not reviewed yet";
  const days = Math.floor((Date.now() - new Date(anchor).getTime()) / 86400000);
  if (days <= 0) return "reviewed today";
  if (days === 1) return "reviewed 1 day ago";
  return `reviewed ${days} days ago`;
}

/**
 * SVG path for a mini decay curve in a 64×24 box. Starts flat-left and drops to a
 * height set by `recall` (lower recall → steeper drop). Colored via CSS `stroke`.
 */
export function sparklinePath(recall: number): string {
  const w = 64;
  const h = 24;
  const pad = 3;
  const x0 = pad;
  const x1 = w - pad;
  const y0 = pad; // start near the top
  const y1 = y0 + (h - pad * 2) * (1 - Math.max(0, Math.min(1, recall))); // end lower as recall drops
  const cx = x0 + (x1 - x0) * 0.55; // control point biases the curve to fall off later
  return `M ${x0} ${y0} Q ${cx} ${y0} ${x1} ${y1}`;
}
