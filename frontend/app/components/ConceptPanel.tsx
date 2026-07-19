"use client";

import type {
  ConceptNodeResponse,
  ConceptReviewRequest,
  ConceptReviewResponse,
  RetrievalFeedbackRequest,
  RetrievalFeedbackResponse,
} from "@/types/study";
import { RecallCheck } from "./RecallCheck";

export function ConceptPanel({
  concept,
  onFeedback,
  onReview,
}: {
  concept: ConceptNodeResponse | null;
  onFeedback: (conceptId: number, body: RetrievalFeedbackRequest) => Promise<RetrievalFeedbackResponse>;
  onReview: (conceptId: number, body: ConceptReviewRequest) => Promise<ConceptReviewResponse>;
}) {
  if (!concept) {
    return <p className="concept-empty">Select a concept on the map to begin a recall check.</p>;
  }

  return (
    <div className="concept-panel">
      <p className="map-eyebrow">Selected concept</p>
      <h2>{concept.title}</h2>
      <p className="concept-explanation">{concept.explanation}</p>
      <div className="concept-memory-note">
        <span>Memory record</span>
        <strong>{concept.review_count === 0 ? "Not reviewed yet" : `${concept.review_count} review${concept.review_count === 1 ? "" : "s"}`}</strong>
      </div>
      <RecallCheck key={concept.id} concept={concept} onFeedback={onFeedback} onReview={onReview} />
    </div>
  );
}
