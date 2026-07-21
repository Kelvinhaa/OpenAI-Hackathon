"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MindMapprMark } from "@/app/components/MindMapprMark";
import { Wordmark } from "@/app/components/Wordmark";
import type { ConceptReviewQueueItem, StudyResponse, StatsResponse } from "@/types/study";
import { formatNextReview, stabilityPct } from "@/lib/reviewFormat";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export default function Dashboard() {
  const router = useRouter();
  const [queue, setQueue]       = useState<ConceptReviewQueueItem[]>([]);
  const [upcoming, setUpcoming] = useState<StudyResponse[]>([]);
  const [stats, setStats]       = useState<StatsResponse | null>(null);
  const [loading, setLoading]   = useState(true);

  const loadData = useCallback(async (t: string) => {
    const headers = { Authorization: `Bearer ${t}` };
    const [qRes, sRes, stRes] = await Promise.all([
      fetch(`${API_BASE}/study/review-queue`, { headers }),
      fetch(`${API_BASE}/study`,              { headers }),
      fetch(`${API_BASE}/study/stats`,        { headers }),
    ]);

    const queueData: ConceptReviewQueueItem[] = qRes.ok  ? await qRes.json()  : [];
    const allData:   StudyResponse[]   = sRes.ok  ? await sRes.json()  : [];
    const statsData: StatsResponse | null = stRes.ok ? await stRes.json() : null;

    setQueue(queueData);
    setUpcoming(allData);
    setStats(statsData);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      loadData(session.access_token);
    });
  }, [router, loadData]);

  return (
    <div className="dash-page">
      <header className="dash-topbar">
        <div className="dash-topbar-logo">
          <MindMapprMark className="dash-topbar-mark" />
          <Wordmark className="dash-topbar-name" />
        </div>
        <nav className="dash-topbar-nav">
          <Link href="/" className="btn btn-ghost">New Plan</Link>
        </nav>
      </header>

      <div className="dash-body">
        <h2 className="dash-heading">Study Dashboard</h2>

        {/* Stats bar */}
        {stats && (
          <div className="stats-bar">
            <div className="stat-card paper-texture">
              <div className="stat-value">{stats.total_sessions}</div>
              <div className="stat-label">Sessions</div>
            </div>
            <div className="stat-card stat-card--due paper-texture">
              <div className="stat-value">{stats.due_today}</div>
              <div className="stat-label">Due Today</div>
            </div>
            <div className="stat-card paper-texture">
              <div className="stat-value">{stats.reviewed_today}</div>
              <div className="stat-label">Reviewed Today</div>
            </div>
          </div>
        )}

        {loading && <p className="dash-empty">Loading sessions…</p>}

        {/* Due for Review */}
        {!loading && queue.length > 0 && (
          <section className="dash-section">
            <div className="dash-section-header">
              <h3 className="dash-section-title">Due for Review</h3>
              <span className="dash-section-count dash-section-count--due">{queue.length}</span>
            </div>
            <div className="session-list">
              {queue.map(s => (
                <div key={s.id} className="session-card session-card--due">
                  <div className="session-info">
                    <span className="session-subject">{s.title}</span>
                    <span className="session-meta">
                      {s.subject} · {s.review_count}× reviewed
                    </span>
                    <div className="stability-bar-wrap">
                      <div className="stability-bar-track">
                        <div
                          className="stability-bar-fill"
                          style={{ width: `${stabilityPct(s.stability)}%` }}
                        />
                      </div>
                      <span className="stability-label">
                        {s.stability > 0 ? `S: ${s.stability.toFixed(1)}d` : "New"}
                      </span>
                    </div>
                  </div>
                  <Link href="/review" className="btn btn-primary">
                    Review
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Coming Up */}
        {!loading && upcoming.length > 0 && (
          <section className="dash-section">
            <div className="dash-section-header">
              <h3 className="dash-section-title">Coming Up</h3>
              <span className="dash-section-count">{upcoming.length}</span>
            </div>
            <div className="session-list">
              {upcoming.map(s => (
                <div key={s.id} className="session-card paper-texture">
                  <div className="session-info">
                    <span className="session-subject">{s.subject}</span>
                    <span className="session-meta">
                      {s.level} · {s.time} min · {s.review_count}× reviewed
                    </span>
                    <span className="session-due">{formatNextReview(s.next_review_at)}</span>
                    <div className="stability-bar-wrap">
                      <div className="stability-bar-track">
                        <div
                          className="stability-bar-fill"
                          style={{ width: `${stabilityPct(s.stability ?? 0)}%` }}
                        />
                      </div>
                      <span className="stability-label">
                        {(s.stability ?? 0) > 0 ? `S: ${s.stability.toFixed(1)}d` : "New"}
                      </span>
                    </div>
                  </div>
                  <Link href="/review" className="btn btn-ghost">
                    review early
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && queue.length === 0 && upcoming.length === 0 && (
          <div className="dash-empty">
            <p>No study sessions yet.</p>
            <Link href="/" className="btn btn-primary">
              Create your first plan
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
