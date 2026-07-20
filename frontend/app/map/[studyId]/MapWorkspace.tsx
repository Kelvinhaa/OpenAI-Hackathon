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

type ExamPathStep = {
  concept: ConceptNodeResponse;
  timing: string;
};

function dateAtStartOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dateFromCalendarValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function orderConceptsByPrerequisite(study: StudyResponse) {
  const conceptsById = new Map(study.concepts.map((concept) => [concept.id, concept]));
  const originalOrder = new Map(study.concepts.map((concept, index) => [concept.id, index]));
  const dependents = new Map<number, number[]>();
  const remainingPrerequisites = new Map<number, number>();

  study.concepts.forEach((concept) => {
    dependents.set(concept.id, []);
    remainingPrerequisites.set(concept.id, 0);
  });
  study.edges.forEach((edge) => {
    if (!conceptsById.has(edge.prerequisite_node_id) || !conceptsById.has(edge.dependent_node_id)) return;
    dependents.get(edge.prerequisite_node_id)?.push(edge.dependent_node_id);
    remainingPrerequisites.set(
      edge.dependent_node_id,
      (remainingPrerequisites.get(edge.dependent_node_id) ?? 0) + 1,
    );
  });

  const sortByOriginalOrder = (left: number, right: number) => (
    (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0)
  );
  const available = study.concepts
    .filter((concept) => remainingPrerequisites.get(concept.id) === 0)
    .map((concept) => concept.id)
    .sort(sortByOriginalOrder);
  const ordered: ConceptNodeResponse[] = [];

  while (available.length > 0) {
    const conceptId = available.shift();
    if (conceptId === undefined) break;
    const concept = conceptsById.get(conceptId);
    if (concept) ordered.push(concept);
    for (const dependentId of dependents.get(conceptId) ?? []) {
      const remaining = (remainingPrerequisites.get(dependentId) ?? 1) - 1;
      remainingPrerequisites.set(dependentId, remaining);
      if (remaining === 0) {
        available.push(dependentId);
        available.sort(sortByOriginalOrder);
      }
    }
  }

  return ordered.length === study.concepts.length ? ordered : study.concepts;
}

function buildExamPath(study: StudyResponse): { daysRemaining: number; steps: ExamPathStep[] } | null {
  if (!study.exam_date || study.concepts.length === 0) return null;

  const today = dateAtStartOfDay(new Date());
  const examDate = dateFromCalendarValue(study.exam_date);
  const daysRemaining = Math.max(0, Math.round((examDate.getTime() - today.getTime()) / 86_400_000));
  const concepts = orderConceptsByPrerequisite(study);

  return {
    daysRemaining,
    steps: concepts.map((concept, index) => {
      const offset = concepts.length === 1 ? 0 : Math.round((index * daysRemaining) / (concepts.length - 1));
      const scheduledDate = new Date(today);
      scheduledDate.setDate(today.getDate() + offset);
      const timing = offset === 0
        ? "Today"
        : offset === daysRemaining
          ? "Exam day"
          : scheduledDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return { concept, timing };
    }),
  };
}

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
  const examPath = useMemo(() => (study ? buildExamPath(study) : null), [study]);

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
              {examPath && (
                <section className="exam-readiness" aria-labelledby="exam-readiness-title">
                  <div className="exam-readiness-heading">
                    <div>
                      <p className="map-eyebrow">Exam-ready path</p>
                      <h2 id="exam-readiness-title">
                        {examPath.daysRemaining === 0 ? "Exam day" : `${examPath.daysRemaining} days to go`}
                      </h2>
                    </div>
                    <span>{study.exam_date}</span>
                  </div>
                  <p>Build from prerequisites first, then arrive ready to retrieve the whole topic.</p>
                  <ol className="exam-readiness-steps">
                    {examPath.steps.map(({ concept, timing }, index) => (
                      <li key={concept.id}>
                        <button
                          type="button"
                          className={`exam-readiness-step${String(concept.id) === selectedConceptId ? " exam-readiness-step--selected" : ""}`}
                          aria-current={String(concept.id) === selectedConceptId ? "step" : undefined}
                          onClick={() => setSelectedConceptId(String(concept.id))}
                        >
                          <span className="exam-readiness-step-number">{index + 1}</span>
                          <span>
                            <strong>{concept.title}</strong>
                            <small>{timing}</small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
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
