"use client";

import { useState } from "react";
import type {
  ConceptNodeResponse,
  ConceptReviewRequest,
  ConceptReviewResponse,
  FsrsRating,
  RetrievalFeedbackRequest,
  RetrievalFeedbackResponse,
} from "@/types/study";

const RATINGS: Array<{ value: FsrsRating; label: string }> = [
  { value: 1, label: "Again" },
  { value: 2, label: "Hard" },
  { value: 3, label: "Good" },
  { value: 4, label: "Easy" },
];

function formatNextReview(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export function RecallCheck({
  concept,
  onFeedback,
  onReview,
}: {
  concept: ConceptNodeResponse;
  onFeedback: (conceptId: number, body: RetrievalFeedbackRequest) => Promise<RetrievalFeedbackResponse>;
  onReview: (conceptId: number, body: ConceptReviewRequest) => Promise<ConceptReviewResponse>;
}) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<RetrievalFeedbackResponse | null>(null);
  const [review, setReview] = useState<ConceptReviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkRecall() {
    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer) {
      setError("Write a brief explanation before checking your recall.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setFeedback(await onFeedback(concept.id, { answer: normalizedAnswer }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not check that response.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRating(rating: FsrsRating) {
    setBusy(true);
    setError(null);
    try {
      setReview(await onReview(concept.id, { answer: answer.trim(), rating }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not save that rating.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="recall-check" aria-labelledby={`recall-${concept.id}`}>
      <h3 id={`recall-${concept.id}`}>Recall check</h3>
      <p className="recall-prompt">{concept.retrieval_prompt}</p>
      <label htmlFor={`answer-${concept.id}`}>Your explanation</label>
      <textarea
        id={`answer-${concept.id}`}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        disabled={busy || Boolean(review)}
        placeholder="Explain it in your own words…"
        rows={4}
      />
      {!feedback && !review && (
        <button className="map-action" onClick={checkRecall} disabled={busy}>
          {busy ? "Checking…" : "Check recall"}
        </button>
      )}
      {error && <p className="recall-error" role="alert">{error}</p>}
      {feedback && !review && (
        <div className="recall-feedback" aria-live="polite">
          <p>{feedback.feedback}</p>
          <p className="suggested-rating">Suggested rating <strong>{RATINGS.find((rating) => rating.value === feedback.suggested_rating)?.label}</strong></p>
          <p className="rating-instruction">Choose the rating that best reflects your recall.</p>
          <div className="recall-ratings" aria-label="Confirm your recall rating">
            {RATINGS.map((rating) => (
              <button
                key={rating.value}
                className="recall-rating"
                onClick={() => confirmRating(rating.value)}
                disabled={busy}
              >
                {rating.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {review && (
        <div className="recall-confirmed" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <div><strong>Review recorded</strong><p>Next review {formatNextReview(review.next_review_at)}</p></div>
        </div>
      )}
    </section>
  );
}
