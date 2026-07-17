"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TopNav } from "@/app/components/TopNav";
import type { StudyResponse } from "@/types/study";
import {
  recallNow,
  decayState,
  reviewedAgo,
  sparklinePath,
  type DecayState,
} from "@/lib/reviewFormat";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const GROUPS: { state: DecayState; label: string }[] = [
  { state: "fading", label: "Fading" },
  { state: "holding", label: "Holding steady" },
  { state: "fresh", label: "Fresh" },
];

type Row = {
  session: StudyResponse;
  recall: number;
  state: DecayState;
};

export default function Library() {
  const router = useRouter();
  const [sessions, setSessions] = useState<StudyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const loadData = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/study`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSessions(res.ok ? await res.json() : []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data : { session } }) => {
      if (!session) {
        router.push("/login"); return; 
      }loadData(session.access_token)
    });
  }, [router, loadData]);
  
  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((s) => !q || s.subject.toLowerCase().includes(q))
      .map((s) => {
        const recall = recallNow(s);
        return { session: s, recall, state: decayState(recall) };
      });
  }, [sessions, query]);

  const grouped = useMemo(() => {
    const map: Record<DecayState, Row[]> = { fading: [], holding: [], fresh: [] };
    for (const r of rows) map[r.state].push(r);
    // Most urgent first within a group.
    for (const k of Object.keys(map) as DecayState[]) {
      map[k].sort((a, b) => a.recall - b.recall);
    }
    return map;
  }, [rows]);

  return (
    <div className="library-page">
      <TopNav />

      <div className="library-body">
        <div className="library-card">
          <div className="library-header">
            <div>
              <h1 className="library-title">Library</h1>
              <p className="library-subtitle">Sorted by what your memory is doing right now.</p>
            </div>
            <span className="library-count">{rows.length} subjects</span>
          </div>

          <input
            className="library-search"
            type="search"
            placeholder="Search subjects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {loading && <p className="library-empty">Loading subjects…</p>}

          {!loading && sessions.length === 0 && (
            <div className="library-empty">
              <p>No study sessions yet.</p>
              <Link href="/" className="btn btn-primary library-empty-cta">
                Create your first plan
              </Link>
            </div>
          )}

          {!loading && sessions.length > 0 && rows.length === 0 && (
            <p className="library-empty">No subjects match “{query}”.</p>
          )}

          {!loading && GROUPS.map(({ state, label }) => {
            const items = grouped[state];
            if (items.length === 0) return null;
            return (
              <section key={state} className="library-group">
                <div className={`library-group-header library-group-header--${state}`}>
                  <span className="library-dot" />
                  {label} — {items.length}
                </div>
                <div className="library-rows">
                  {items.map(({ session, recall }) => (
                    <div
                      key={session.id}
                      className={`library-row library-row--${state}`}
                      style={{ opacity: 0.55 + 0.45 * (1 - recall) }}
                    >
                      <svg className="library-spark" viewBox="0 0 64 24" aria-hidden="true">
                        <path d={sparklinePath(recall)} fill="none" strokeWidth="2" strokeLinecap="round" />
                        <circle cx="61" cy={sparkEndY(recall)} r="2.4" />
                      </svg>
                      <div className="library-row-info">
                        <span className="library-row-subject">{session.subject}</span>
                        <span className="library-row-meta">
                          {reviewedAgo(session)} · stability {session.stability.toFixed(1)}d
                        </span>
                      </div>
                      <div className="library-recall">
                        <span className="library-recall-pct">{Math.round(recall * 100)}%</span>
                        <span className="library-recall-cap">Recall now</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// End dot y-coordinate — keep in sync with sparklinePath's endpoint.
function sparkEndY(recall: number): number {
  const pad = 3;
  const h = 24;
  return pad + (h - pad * 2) * (1 - Math.max(0, Math.min(1, recall)));
}
