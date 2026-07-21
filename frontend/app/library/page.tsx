"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TopNav } from "@/app/components/TopNav";
import type { StudyResponse } from "@/types/study";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

function conceptCount(map: StudyResponse) {
  return map.concept_count ?? map.concepts.length;
}

function dueConceptCount(map: StudyResponse) {
  if (map.due_concept_count != null) return map.due_concept_count;
  const now = Date.now();
  return map.concepts.filter((concept) => concept.next_review_at && new Date(concept.next_review_at).getTime() <= now).length;
}

export default function Library() {
  const router = useRouter();
  const [sessions, setSessions] = useState<StudyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
        return;
      }
      setAccessToken(session.access_token);
      loadData(session.access_token);
    });
  }, [router, loadData]);

  async function removeMap(studyId: number) {
    if (!accessToken) {
      setRemoveError("Your session has expired. Please sign in again.");
      return;
    }

    setRemovingId(studyId);
    setRemoveError(null);
    try {
      const response = await fetch(`${API_BASE}/study/${studyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("We could not remove that learning map.");

      setSessions((items) => items.filter((item) => item.id !== studyId));
      setPendingRemovalId(null);
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "We could not remove that learning map.");
    } finally {
      setRemovingId(null);
    }
  }

  const maps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((s) => !q || s.subject.toLowerCase().includes(q))
      .sort((a, b) => dueConceptCount(b) - dueConceptCount(a) || a.subject.localeCompare(b.subject));
  }, [sessions, query]);

  return (
    <div className="library-page">
      <TopNav />

      <div className="library-body">
        <div className="library-card">
          <div className="library-header">
            <div>
              <h1 className="library-title">Library</h1>
              <p className="library-subtitle">Your saved learning maps, ready to pick back up.</p>
            </div>
            <span className="library-count">{maps.length} maps</span>
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

          {!loading && sessions.length > 0 && maps.length === 0 && (
            <p className="library-empty">No subjects match “{query}”.</p>
          )}

          {!loading && maps.length > 0 && (
            <div className="library-maps">
              {maps.map((map) => {
                const totalConcepts = conceptCount(map);
                const dueConcepts = dueConceptCount(map);
                return (
                  <article key={map.id} className="library-map-card">
                    <div className="library-map-notebook-mark" aria-hidden="true" />
                    <div className="library-map-copy">
                      <p className="library-map-level">{map.level}</p>
                      <h2 className="library-map-topic">{map.subject}</h2>
                      <dl className="library-map-facts">
                        <div>
                          <dt>Concepts</dt>
                          <dd>{totalConcepts}</dd>
                        </div>
                        <div>
                          <dt>Due now</dt>
                          <dd>{dueConcepts}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="library-map-actions">
                      <Link href={`/map/${map.id}`} className="library-map-link">
                        open plan map <span aria-hidden="true">→</span>
                      </Link>
                      {pendingRemovalId === map.id ? (
                        <div className="library-map-removal" role="group" aria-label={`Remove ${map.subject}`}>
                          <span>remove this map?</span>
                          <div>
                            <button
                              type="button"
                              onClick={() => removeMap(map.id)}
                              disabled={removingId === map.id}
                            >
                              {removingId === map.id ? "removing…" : "remove permanently"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingRemovalId(null)}
                              disabled={removingId === map.id}
                            >
                              cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="library-map-remove"
                          aria-label={`remove ${map.subject}`}
                          onClick={() => {
                            setPendingRemovalId(map.id);
                            setRemoveError(null);
                          }}
                        >
                          remove
                        </button>
                      )}
                      {removeError && pendingRemovalId === map.id && (
                        <p className="library-map-remove-error" role="alert">{removeError}</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
