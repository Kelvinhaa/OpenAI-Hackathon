export interface Technique {
  title: string;
  description: string;
  duration_minutes: number;
}

export interface StudyRecommendation {
  summary: string;
  techniques: Technique[];
  tips: string[];
}

export type FsrsRating = 1 | 2 | 3 | 4;

export type MasteryState = "new" | "needs_work" | "growing" | "mastered";

export interface ConceptNodeResponse {
  id: number;
  key: string;
  title: string;
  explanation: string;
  retrieval_prompt: string;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  review_count: number;
  interval_days: number;
  stability: number;
  difficulty: number;
  last_rating: FsrsRating | null;
}

export interface ConceptEdgeResponse {
  id: number;
  prerequisite_node_id: number;
  dependent_node_id: number;
}

export interface StudyResponse {
  id: number;
  user_id: string;
  time: number;
  subject: string;
  level: string;
  goal: string | null;
  recommendation: StudyRecommendation;
  created_at?: string | null;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  review_count: number;
  interval_days: number;
  stability: number;
  concepts: ConceptNodeResponse[];
  edges: ConceptEdgeResponse[];
}

export interface PreviewResponse {
  subject: string;
  time: number;
  level: string;
  goal?: string | null;
  recommendation: StudyRecommendation;
}

export interface ReviewResponse {
  id: number;
  next_review_at: string;
  review_count: number;
  interval_days: number;
  ease_factor: number;
  stability: number;
}

export interface ReviewQueueItem {
  id: number;
  subject: string;
  level: string;
  goal: string | null;
  time: number;
  review_count: number;
  interval_days: number;
  next_review_at: string | null;
  days_overdue: number;
  stability: number;
  ease_factor: number;
  retrievability: number;
  recommendation: StudyRecommendation;
}

export interface StatsResponse {
  total_sessions: number;
  due_today: number;
  reviewed_today: number;
  avg_stability: number;
}

export interface ReviewPreviewResponse {
  id: number;
  subject: string;
  level: string;
  time: number;
  review_count: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  again_days: number;
  hard_days: number;
  good_days: number;
  easy_days: number;
  recommendation: StudyRecommendation;
}

export interface StudyFormData {
  subject: string;
  time: number;
  level: string;
  goal: string;
}

export interface RetrievalFeedbackRequest {
  answer: string;
}

export interface RetrievalFeedbackResponse {
  feedback: string;
  suggested_rating: FsrsRating;
  prerequisite_concept_id: number | null;
}

export interface ConceptReviewRequest {
  rating: FsrsRating;
  answer: string;
}

export interface ConceptReviewResponse {
  id: number;
  last_reviewed_at: string;
  next_review_at: string;
  review_count: number;
  interval_days: number;
  stability: number;
  difficulty: number;
  last_rating: FsrsRating;
  mastery_state: MasteryState;
}
