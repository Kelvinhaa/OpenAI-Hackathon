"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TopNav } from "@/app/components/TopNav";
import type { ReviewQueueItem, ReviewPreviewResponse, ReviewResponse } from "@/types/study";
import { stabilityPct, urgencyCardClass, urgencyBadge, formatIntervalDays } from "@/lib/reviewFormat";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const RATING_LABELS: Record<number, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

type Mode = "loading" | "empty" | "queue" | "active" | "confirmed";

type ConfirmState = {
  rating: number;
  days: number;
  beforeStability: number;
  afterStability: number;
  beforeRetrievability: number;
};

function memoryNote(retrievability: number): string {
  if (retrievability < 0.5) return "You're past the ideal review point — this is fading. Good time to reinforce it.";
  if (retrievability < 0.8) return "Recall is softening. A review now will lock it back in.";
  return "Still fresh — reviewing now keeps it that way.";
}

export default function ReviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken]     = useState<string | null>(null);
  const [mode, setMode]       = useState<Mode>("loading");
  const [queue, setQueue]     = useState<ReviewQueueItem[]>([]);
  const [preview, setPreview] = useState<ReviewPreviewResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [cameFromQueue, setCameFromQueue] = useState(false);

  const fetchQueue = useCallback(async (t: string, enter: boolean) => {
    const res = await fetch(`${API_BASE}/study/review-queue`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const data: ReviewQueueItem[] = res.ok ? await res.json() : [];
    const sorted = [...data].sort((a, b) => a.retrievability - b.retrievability);
    setQueue(sorted);
    if (enter) setMode(sorted.length ? "queue" : "empty");
  }, []);

  const fetchPreview = useCallback(async (t: string, id: string | number) => {
    const res = await fetch(`${API_BASE}/study/${id}/review-preview`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) { setMode("empty"); return; }
    const data: ReviewPreviewResponse = await res.json();
    setPreview(data);
    setConfirm(null);
    setMode("active");
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      const t = session.access_token;
      setToken(t);
      const sessionParam = searchParams.get("session");
      if (sessionParam) {
        fetchPreview(t, sessionParam);
      } else {
        setCameFromQueue(true);
        fetchQueue(t, true);
      }
    });
  }, [router, searchParams, fetchPreview, fetchQueue]);

  async function submitRating(rating: number) {
    if (!preview || !token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/study/${preview.id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        const data: ReviewResponse = await res.json();
        setConfirm({
          rating,
          days: data.interval_days,
          beforeStability: preview.stability,
          afterStability: data.stability,
          beforeRetrievability: preview.retrievability,
        });
        setMode("confirmed");
        fetchQueue(token, false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function cancelActive() {
    if (cameFromQueue) { setPreview(null); setMode("queue"); }
    else router.push("/dashboard");
  }

  function backFromConfirm() {
    if (cameFromQueue && queue.length > 0) { setPreview(null); setMode("queue"); }
    else router.push("/dashboard");
  }

  return (
    <div className="dash-page">
      <TopNav />

      <div className="dash-body">
        {mode === "loading" && <p className="dash-empty">Loading…</p>}

        {mode === "empty" && (
          <div className="dash-empty">
            <p>Nothing due for review right now.</p>
            <Link href="/dashboard" className="btn btn-primary">Back to dashboard</Link>
          </div>
        )}

        {mode === "queue" && (
          <>
            <h2 className="dash-heading">Due for review</h2>
            <p className="review-panel-note" style={{ marginTop: "-0.75rem", marginBottom: "1.5rem" }}>
              {`${queue.length} waiting · sorted by how much you're forgetting`}
            </p>
            <div className="session-list">
              {queue.map(s => {
                const badge = urgencyBadge(s);
                return (
                  <div key={s.id} className={urgencyCardClass(s)}>
                    <div className="session-info">
                      <span className="session-subject">{s.subject}</span>
                      <span className="session-meta">
                        {s.level} · {s.time} min · {s.review_count}× reviewed
                      </span>
                      <span className={badge.cls}>{badge.label}</span>
                      <div className="stability-bar-wrap">
                        <div className="stability-bar-track">
                          <div className="stability-bar-fill" style={{ width: `${stabilityPct(s.stability)}%` }} />
                        </div>
                        <span className="stability-label">
                          {s.review_count > 0 ? `${Math.round(s.retrievability * 100)}% · S ${s.stability.toFixed(1)}d` : "New"}
                        </span>
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={() => token && fetchPreview(token, s.id)}>
                      Start review →
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {mode === "active" && preview && (
          <>
            <h2 className="dash-heading">Reviewing: {preview.subject}</h2>

            <div className="review-panel">
              <div className="review-panel-header">
                <span className="review-panel-label">Memory strength</span>
                <span className="review-panel-label">FSRS-5</span>
              </div>
              {preview.review_count > 0 ? (
                <>
                  <div className="review-panel-stats">
                    <div>
                      <div className="review-panel-retrievability">{Math.round(preview.retrievability * 100)}%</div>
                      <div className="review-panel-sub">Retrievability now</div>
                    </div>
                    <div className="review-panel-meta">
                      Stability&nbsp; <strong>{preview.stability.toFixed(1)}d</strong><br />
                      Difficulty&nbsp; <strong>{preview.difficulty.toFixed(1)}/10</strong><br />
                      Reviewed&nbsp; <strong>{preview.review_count}×</strong>
                    </div>
                  </div>
                  <p className="review-panel-note">{memoryNote(preview.retrievability)}</p>
                </>
              ) : (
                <p className="review-panel-note">First review — rate however well you recall this material right now.</p>
              )}
            </div>

            <details className="recap-details">
              <summary className="recap-summary">
                Show session recap ({preview.recommendation.techniques.length} techniques)
              </summary>
              <div className="recap-body">
                <p className="modal-body" style={{ marginBottom: 0 }}>{preview.recommendation.summary}</p>
                {preview.recommendation.techniques.map((t, i) => (
                  <div key={i} className="technique-mini">
                    <strong>{t.title}</strong> · {t.duration_minutes} min
                    <p className="technique-mini-desc">{t.description}</p>
                  </div>
                ))}
              </div>
            </details>

            <p className="modal-prompt">How well did you recall this material?</p>
            <div className="review-buttons">
              <button className="review-btn review-btn-rating-1 review-btn-tall" disabled={submitting} onClick={() => submitRating(1)}>
                Again<span className="review-btn-sublabel">{formatIntervalDays(preview.again_days)}</span>
              </button>
              <button className="review-btn review-btn-rating-2 review-btn-tall" disabled={submitting} onClick={() => submitRating(2)}>
                Hard<span className="review-btn-sublabel">{formatIntervalDays(preview.hard_days)}</span>
              </button>
              <button className="review-btn review-btn-rating-3 review-btn-tall" disabled={submitting} onClick={() => submitRating(3)}>
                Good<span className="review-btn-sublabel">{formatIntervalDays(preview.good_days)}</span>
              </button>
              <button className="review-btn review-btn-rating-4 review-btn-tall" disabled={submitting} onClick={() => submitRating(4)}>
                Easy<span className="review-btn-sublabel">{formatIntervalDays(preview.easy_days)}</span>
              </button>
            </div>
            <button className="btn btn-ghost modal-cancel" disabled={submitting} onClick={cancelActive}>
              Cancel
            </button>
          </>
        )}

        {mode === "confirmed" && confirm && preview && (
          <div className="review-panel confirm-card">
            <div className="confirm-check">✓</div>
            <h2 className="dash-heading" style={{ marginBottom: "0.375rem" }}>
              Rated &quot;{RATING_LABELS[confirm.rating]}&quot; — nice work
            </h2>
            <p className="review-panel-note">
              {`${preview.subject} is now scheduled to catch you right before you'd forget again.`}
            </p>
            <div className="confirm-grid">
              <div className="confirm-grid-item">
                <div className="confirm-grid-label">Stability</div>
                <div className="confirm-grid-value">
                  {confirm.beforeStability.toFixed(1)}d <span className="arrow">→ {confirm.afterStability.toFixed(1)}d</span>
                </div>
              </div>
              <div className="confirm-grid-item">
                <div className="confirm-grid-label">Retrievability</div>
                <div className="confirm-grid-value">
                  {Math.round(confirm.beforeRetrievability * 100)}% <span className="arrow">→ 100%</span>
                </div>
              </div>
            </div>
            <button className="btn btn-ghost modal-cancel" style={{ marginTop: "1.5rem" }} onClick={backFromConfirm}>
              {cameFromQueue && queue.length > 0 ? `Back to queue · ${queue.length} left` : "Back to dashboard"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
