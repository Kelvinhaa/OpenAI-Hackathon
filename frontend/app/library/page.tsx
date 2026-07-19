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
      loadData(session.access_token);
    });
  }, [router, loadData]);

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
                    <Link href={`/map/${map.id}`} className="library-map-link">
                      Open {map.subject.toLocaleLowerCase()} map <span aria-hidden="true">→</span>
                    </Link>
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
