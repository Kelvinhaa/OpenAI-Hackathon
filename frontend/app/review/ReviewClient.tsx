"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopNav } from "@/app/components/TopNav";
import { RecallCheck } from "@/app/components/RecallCheck";
import { createClient } from "@/lib/supabase/client";
import type {
  ConceptReviewQueueItem,
  ConceptReviewRequest,
  ConceptReviewResponse,
  RetrievalFeedbackRequest,
  RetrievalFeedbackResponse,
  StudyResponse,
} from "@/types/study";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

type RecordedReview = {
  title: string;
  nextReviewAt: string;
  wasDue: boolean;
};

function reviewItemFromConcept(
  concept: StudyResponse["concepts"][number],
  subject: string,
): ConceptReviewQueueItem {
  return { ...concept, subject };
}

function sortByNextReview(items: ConceptReviewQueueItem[]) {
  return [...items].sort((first, second) => (
    new Date(first.next_review_at ?? 0).getTime() - new Date(second.next_review_at ?? 0).getTime()
  ));
}

export default function ReviewClient() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [queue, setQueue] = useState<ConceptReviewQueueItem[]>([]);
  const [upcoming, setUpcoming] = useState<ConceptReviewQueueItem[]>([]);
  const [unscheduled, setUnscheduled] = useState<ConceptReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [recorded, setRecorded] = useState<RecordedReview | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedEarlyConcept, setSelectedEarlyConcept] = useState<ConceptReviewQueueItem | null>(null);

  const fetchQueue = useCallback(async (accessToken: string) => {
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [queueResponse, studiesResponse] = await Promise.all([
        fetch(`${API_BASE}/study/review-queue`, { headers }),
        fetch(`${API_BASE}/study`, { headers }),
      ]);
      const dueConcepts: ConceptReviewQueueItem[] = queueResponse.ok
        ? await queueResponse.json()
        : [];
      const studies: StudyResponse[] = studiesResponse.ok ? await studiesResponse.json() : [];
      const dueConceptIds = new Set(dueConcepts.map((concept) => concept.id));
      const now = Date.now();
      const upcomingConcepts: ConceptReviewQueueItem[] = [];
      const unscheduledConcepts: ConceptReviewQueueItem[] = [];

      for (const study of studies) {
        for (const concept of study.concepts) {
          if (dueConceptIds.has(concept.id)) continue;
          const reviewItem = reviewItemFromConcept(concept, study.subject);
          if (concept.next_review_at && new Date(concept.next_review_at).getTime() > now) {
            upcomingConcepts.push(reviewItem);
          } else if (!concept.next_review_at) {
            unscheduledConcepts.push(reviewItem);
          }
        }
      }

      setQueue(dueConcepts);
      setUpcoming(sortByNextReview(upcomingConcepts));
      setUnscheduled(unscheduledConcepts);
    } catch {
      setQueue([]);
      setUpcoming([]);
      setUnscheduled([]);
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
      setToken(session.access_token);
      fetchQueue(session.access_token);
    });
  }, [fetchQueue, router]);

  const requestFeedback = useCallback(async (conceptId: number, body: RetrievalFeedbackRequest): Promise<RetrievalFeedbackResponse> => {
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch(`${API_BASE}/study/concepts/${conceptId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("We could not check that response.");
    return response.json();
  }, [token]);

  const requestReview = useCallback(async (conceptId: number, body: ConceptReviewRequest): Promise<ConceptReviewResponse> => {
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const reviewedConcept = selectedEarlyConcept ?? queue[activeIndex];
    const wasDue = reviewedConcept?.id === queue[activeIndex]?.id;
    const response = await fetch(`${API_BASE}/study/concepts/${conceptId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("We could not save that rating.");
    const result: ConceptReviewResponse = await response.json();
    setRecorded({
      title: reviewedConcept?.title ?? "Concept",
      nextReviewAt: result.next_review_at,
      wasDue,
    });
    if (reviewedConcept && !wasDue) {
      const rescheduledConcept = { ...reviewedConcept, ...result };
      setUpcoming((items) => sortByNextReview([
        ...items.filter((concept) => concept.id !== conceptId),
        rescheduledConcept,
      ]));
      setUnscheduled((items) => items.filter((concept) => concept.id !== conceptId));
    }
    return result;
  }, [activeIndex, queue, selectedEarlyConcept, token]);

  const currentConcept = selectedEarlyConcept ?? queue[activeIndex];
  const remainingCount = Math.max(queue.length - activeIndex - (recorded ? 1 : 0), 0);
  const remainingLabel = `${remainingCount} concept${remainingCount === 1 ? "" : "s"} remain`;

  function showNextConcept() {
    setActiveIndex((index) => index + 1);
    setSelectedEarlyConcept(null);
    setRecorded(null);
  }

  function showEarlyConcept(concept: ConceptReviewQueueItem) {
    setRecorded(null);
    setSelectedEarlyConcept(concept);
  }

  function returnToSchedule() {
    setRecorded(null);
    setSelectedEarlyConcept(null);
  }

  return (
    <div className="review-page">
      <TopNav />
      <main className="review-body">
        <header className="review-heading">
          <p className="review-eyebrow">Retrieval practice</p>
          <h1>Due for review</h1>
          {!loading && <p>{remainingLabel}</p>}
        </header>

        {loading && <p className="review-empty">Opening your review notebook…</p>}

        {!loading && recorded && (
          <div className="review-recorded" role="status">
            <p>{recorded.title} recorded. Next review {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(recorded.nextReviewAt))}.</p>
            <div className="review-complete-actions">
              {recorded.wasDue && queue[activeIndex + 1] ? (
                <button type="button" className="btn btn-primary" onClick={showNextConcept}>Next due concept</button>
              ) : !recorded.wasDue ? (
                <button type="button" className="btn btn-primary" onClick={returnToSchedule}>Back to review schedule</button>
              ) : (
                <Link href="/library" className="btn btn-primary">Back to your maps</Link>
              )}
            </div>
          </div>
        )}

        {!loading && currentConcept && (
          <article className="review-concept-card">
            <div className="review-concept-heading">
              <div>
                <p className="review-parent-topic">From {currentConcept.subject}</p>
                <h2>{currentConcept.title}</h2>
              </div>
              <span className="review-concept-count">{currentConcept.review_count === 0 ? "New" : `${currentConcept.review_count} reviews`}</span>
            </div>
            <RecallCheck
              key={currentConcept.id}
              concept={currentConcept}
              onFeedback={requestFeedback}
              onReview={requestReview}
            />
          </article>
        )}

        {!loading && !currentConcept && !recorded && (
          <div className="review-empty">
            <p>Nothing is due right now. You can begin a new concept or review early below.</p>
          </div>
        )}

        {!loading && upcoming.length > 0 && (
          <section className="review-timeline" aria-labelledby="upcoming-review-heading">
            <div className="review-timeline-heading">
              <div>
                <p className="review-eyebrow">On your schedule</p>
                <h2 id="upcoming-review-heading">Upcoming review</h2>
              </div>
              <span>{upcoming.length}</span>
            </div>
            <div className="review-timeline-list">
              {upcoming.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  className="review-timeline-card"
                  aria-label={`Review ${concept.title} early`}
                  onClick={() => showEarlyConcept(concept)}
                >
                  <time dateTime={concept.next_review_at ?? undefined} className="review-timeline-date">
                    {concept.next_review_at && new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(concept.next_review_at))}
                  </time>
                  <span className="review-timeline-copy">
                    <span className="review-parent-topic">From {concept.subject}</span>
                    <strong>{concept.title}</strong>
                  </span>
                  <span className="review-timeline-action">review early <span aria-hidden="true">→</span></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {!loading && unscheduled.length > 0 && (
          <section className="review-timeline review-timeline--new" aria-labelledby="first-recall-heading">
            <div className="review-timeline-heading">
              <div>
                <p className="review-eyebrow">New to your notebook</p>
                <h2 id="first-recall-heading">Start first recall</h2>
              </div>
              <span>{unscheduled.length}</span>
            </div>
            <div className="review-timeline-list">
              {unscheduled.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  className="review-timeline-card"
                  aria-label={`Start ${concept.title}`}
                  onClick={() => showEarlyConcept(concept)}
                >
                  <span className="review-timeline-date">New</span>
                  <span className="review-timeline-copy">
                    <span className="review-parent-topic">From {concept.subject}</span>
                    <strong>{concept.title}</strong>
                  </span>
                  <span className="review-timeline-action">start recall <span aria-hidden="true">→</span></span>
                </button>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
