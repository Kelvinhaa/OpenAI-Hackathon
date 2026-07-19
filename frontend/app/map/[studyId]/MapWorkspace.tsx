"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNav } from "@/app/components/TopNav";
import { LearningMapCanvas } from "@/app/components/LearningMapCanvas";
import { ConceptPanel } from "@/app/components/ConceptPanel";
import { createClient } from "@/lib/supabase/client";
import type {
  ConceptNodeResponse,
  ConceptReviewRequest,
  ConceptReviewResponse,
  RetrievalFeedbackRequest,
  RetrievalFeedbackResponse,
  StudyResponse,
} from "@/types/study";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export default function MapWorkspace({ studyId }: { studyId: string }) {
  const [study, setStudy] = useState<StudyResponse | null>(null);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function loadStudy() {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        if (active) {
          setError("Your session has expired. Sign in again to open this learning map.");
          setLoading(false);
        }
        return;
      }

      setToken(accessToken);
      try {
        const response = await fetch(`${API_BASE}/study/${studyId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error("We could not load this learning map.");
        const nextStudy: StudyResponse = await response.json();
        if (!active) return;
        setStudy(nextStudy);
        setSelectedConceptId(nextStudy.concepts[0] ? String(nextStudy.concepts[0].id) : null);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "We could not load this learning map.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadStudy();
    return () => { active = false; };
  }, [studyId]);

  const request = useCallback(async <T,>(path: string, body: object): Promise<T> => {
    if (!token) throw new Error("Your session has expired. Sign in again to continue.");
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("That response could not be saved. Try again.");
    return response.json() as Promise<T>;
  }, [token]);

  const handleFeedback = useCallback((conceptId: number, body: RetrievalFeedbackRequest) => (
    request<RetrievalFeedbackResponse>(`/study/concepts/${conceptId}/feedback`, body)
  ), [request]);

  const handleReview = useCallback(async (conceptId: number, body: ConceptReviewRequest) => {
    const review = await request<ConceptReviewResponse>(`/study/concepts/${conceptId}/review`, body);
    setStudy((current) => current ? {
      ...current,
      concepts: current.concepts.map((concept) => (
        concept.id === conceptId ? { ...concept, ...review } : concept
      )),
    } : current);
    return review;
  }, [request]);

  const selectedConcept = useMemo<ConceptNodeResponse | null>(() => (
    study?.concepts.find((concept) => String(concept.id) === selectedConceptId) ?? null
  ), [selectedConceptId, study]);

  return (
    <main className="map-page">
      <TopNav />
      <section className="map-workbench" aria-label="Learning map workspace">
        {loading && <p className="map-status">Unfolding your learning map…</p>}
        {error && <p className="map-status map-status--error" role="alert">{error}</p>}
        {study && (
          <>
            <aside className="map-rail map-rail--context" aria-label="Map context">
              <p className="map-eyebrow">Saved map</p>
              <h1>{study.subject}</h1>
              <p className="map-rail-copy">{study.goal || "Follow the dependencies, then practice recalling each idea."}</p>
              <dl className="map-facts">
                <div><dt>Level</dt><dd>{study.level}</dd></div>
                <div><dt>Concepts</dt><dd>{study.concepts.length}</dd></div>
                <div><dt>Study time</dt><dd>{study.time} min</dd></div>
              </dl>
              <p className="map-legend"><span aria-hidden="true" />Orange threads mark what to understand first.</p>
            </aside>

            <section className="map-canvas-stage" aria-label={`${study.subject} concept map`}>
              <div className="map-stage-heading">
                <div>
                  <p className="map-eyebrow">Concept field</p>
                  <h2>Trace the prerequisites</h2>
                </div>
                <p>{study.concepts.length} connected ideas</p>
              </div>
              <LearningMapCanvas
                concepts={study.concepts}
                edges={study.edges}
                selectedConceptId={selectedConceptId}
                onSelect={setSelectedConceptId}
              />
            </section>

            <aside className="map-rail map-rail--detail" aria-label="Concept detail">
              <ConceptPanel
                concept={selectedConcept}
                onFeedback={handleFeedback}
                onReview={handleReview}
              />
            </aside>
          </>
        )}
      </section>
    </main>
  );
}
