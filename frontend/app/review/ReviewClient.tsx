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
} from "@/types/study";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

type RecordedReview = {
  title: string;
  nextReviewAt: string;
};

export default function ReviewClient() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [queue, setQueue] = useState<ConceptReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [recorded, setRecorded] = useState<RecordedReview | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const fetchQueue = useCallback(async (accessToken: string) => {
    try {
      const response = await fetch(`${API_BASE}/study/review-queue`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setQueue(response.ok ? await response.json() : []);
    } catch {
      setQueue([]);
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
    const reviewedConcept = queue[activeIndex];
    const response = await fetch(`${API_BASE}/study/concepts/${conceptId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("We could not save that rating.");
    const result: ConceptReviewResponse = await response.json();
    setRecorded({ title: reviewedConcept?.title ?? "Concept", nextReviewAt: result.next_review_at });
    return result;
  }, [activeIndex, queue, token]);

  const currentConcept = queue[activeIndex];
  const remainingCount = Math.max(queue.length - activeIndex - (recorded ? 1 : 0), 0);
  const remainingLabel = `${remainingCount} concept${remainingCount === 1 ? "" : "s"} remain`;

  function showNextConcept() {
    setActiveIndex((index) => index + 1);
    setRecorded(null);
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
              {queue[activeIndex + 1] ? (
                <button type="button" className="btn btn-primary" onClick={showNextConcept}>Next due concept</button>
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
            <p>Nothing is due for review right now.</p>
            <Link href="/library" className="btn btn-primary">Browse your maps</Link>
          </div>
        )}

      </main>
    </div>
  );
}
