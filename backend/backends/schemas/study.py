import re
import uuid
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import List, Literal, Optional


class StudyRequest(BaseModel):
    time: int = Field(
        ge=5, le=480, description="Study duration in minutes (between 5 and 480)"
    )
    subject: str = Field(min_length=1, max_length=200)
    level: Literal["beginner", "intermediate", "advanced"]
    goal: Optional[str] = Field(default=None, max_length=500, description="Optional learning goal")
    exam_date: Optional[date] = Field(default=None, description="Optional exam date")

    @field_validator("subject")
    @classmethod
    def normalize_subject(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("subject must not be blank")
        return normalized

    @field_validator("goal")
    @classmethod
    def normalize_goal(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("exam_date")
    @classmethod
    def require_today_or_future_exam_date(cls, value: Optional[date]) -> Optional[date]:
        if value is not None and value < date.today():
            raise ValueError("exam date must be today or later")
        return value


class Technique(BaseModel):
    title: str
    description: str
    duration_minutes: int


class StudyRecommendation(BaseModel):
    summary: str
    techniques: List[Technique]
    tips: List[str]


class GeneratedConcept(BaseModel):
    key: str
    title: str
    explanation: str
    retrieval_prompt: str

    @field_validator("key")
    @classmethod
    def require_lowercase_kebab_case_key(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("concept key must not be blank")
        if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", normalized) is None:
            raise ValueError("concept key must be lowercase kebab-case")
        return normalized

    @field_validator("title", "explanation", "retrieval_prompt")
    @classmethod
    def require_non_blank_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("concept fields must not be blank")
        return normalized


class GeneratedConceptEdge(BaseModel):
    prerequisite_key: str
    dependent_key: str

    @field_validator("prerequisite_key", "dependent_key")
    @classmethod
    def require_non_blank_key(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("edge concept keys must not be blank")
        return normalized


class GeneratedLearningExperience(StudyRecommendation):
    concepts: List[GeneratedConcept]
    edges: List[GeneratedConceptEdge]

    @model_validator(mode="after")
    def validate_learning_map(self) -> "GeneratedLearningExperience":
        if not 4 <= len(self.concepts) <= 6:
            raise ValueError("learning maps must contain between 4 and 6 concepts")

        concept_keys = [concept.key for concept in self.concepts]
        concept_key_set = set(concept_keys)
        if len(concept_key_set) != len(concept_keys):
            raise ValueError("concept keys must be unique")

        edge_pairs: set[tuple[str, str]] = set()
        adjacency: dict[str, list[str]] = {key: [] for key in concept_key_set}
        for edge in self.edges:
            if edge.prerequisite_key == edge.dependent_key:
                raise ValueError("a concept cannot be a prerequisite of itself")
            if edge.prerequisite_key not in concept_key_set:
                raise ValueError("edge prerequisite references an unknown concept")
            if edge.dependent_key not in concept_key_set:
                raise ValueError("edge dependent references an unknown concept")
            pair = (edge.prerequisite_key, edge.dependent_key)
            if pair in edge_pairs:
                raise ValueError("learning maps cannot contain duplicate edges")
            edge_pairs.add(pair)
            adjacency[edge.prerequisite_key].append(edge.dependent_key)

        visited: set[str] = set()
        visiting: set[str] = set()

        def contains_cycle(key: str) -> bool:
            if key in visiting:
                return True
            if key in visited:
                return False

            visiting.add(key)
            if any(contains_cycle(neighbor) for neighbor in adjacency[key]):
                return True
            visiting.remove(key)
            visited.add(key)
            return False

        if any(contains_cycle(key) for key in concept_key_set):
            raise ValueError("learning maps cannot contain prerequisite cycles")

        return self


class ConceptNodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    title: str
    explanation: str
    retrieval_prompt: str
    last_reviewed_at: Optional[datetime] = None
    next_review_at: Optional[datetime] = None
    review_count: int
    interval_days: int
    stability: float
    difficulty: float
    last_rating: Optional[int] = Field(default=None, ge=1, le=4)


class RetrievalAnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=10_000)

    @field_validator("answer")
    @classmethod
    def require_non_blank_answer(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("answer must not be blank")
        return normalized


class RetrievalFeedbackResponse(BaseModel):
    feedback: str = Field(min_length=1, max_length=1_000)
    suggested_rating: int = Field(ge=1, le=4)
    prerequisite_concept_key: Optional[str] = Field(default=None, max_length=128)

    @field_validator("feedback")
    @classmethod
    def require_at_most_two_sentences(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("feedback must not be blank")
        # The prompt instructs the model to use complete sentences. This catches
        # overlong responses without trying to infer sentence boundaries from
        # abbreviations or decimal numbers.
        if len(re.findall(r"[.!?](?:\s|$)", normalized)) > 2:
            raise ValueError("feedback must contain at most two sentences")
        return normalized

    @field_validator("prerequisite_concept_key")
    @classmethod
    def normalize_prerequisite_key(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", normalized) is None:
            raise ValueError("prerequisite concept key must be lowercase kebab-case")
        return normalized


class RetrievalFeedbackResult(BaseModel):
    feedback: str
    suggested_rating: int = Field(ge=1, le=4)
    prerequisite_concept_id: Optional[int] = None


class ConceptReviewRequest(RetrievalAnswerRequest):
    rating: int = Field(
        ge=1, le=4, description="FSRS rating: 1=Again, 2=Hard, 3=Good, 4=Easy"
    )


class ConceptReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    last_reviewed_at: datetime
    next_review_at: datetime
    review_count: int
    interval_days: int
    stability: float
    difficulty: float
    last_rating: int = Field(ge=1, le=4)


class ConceptReviewQueueItem(ConceptNodeResponse):
    subject: str


class ConceptEdgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    prerequisite_node_id: int
    dependent_node_id: int


class StudyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: uuid.UUID
    time: int
    subject: str
    level: str
    goal: Optional[str] = None
    exam_date: Optional[date] = None
    recommendation: StudyRecommendation
    created_at: Optional[datetime] = None
    last_reviewed_at: Optional[datetime] = None
    next_review_at: Optional[datetime] = None
    review_count: int = 0
    interval_days: int = 1
    stability: float = 0.0
    concept_count: int = 0
    due_concept_count: int = 0
    concepts: List[ConceptNodeResponse] = Field(default_factory=list)
    edges: List[ConceptEdgeResponse] = Field(default_factory=list)


class PreviewResponse(BaseModel):
    subject: str
    time: int
    level: str
    goal: Optional[str] = None
    exam_date: Optional[date] = None
    recommendation: StudyRecommendation


class ReviewRequest(BaseModel):
    rating: int = Field(ge=1, le=4, description="FSRS rating: 1=Again, 2=Hard, 3=Good, 4=Easy")


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    next_review_at: datetime
    review_count: int
    interval_days: int
    ease_factor: float
    stability: float


class ReviewQueueItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    level: str
    goal: Optional[str] = None
    time: int
    review_count: int
    interval_days: int
    next_review_at: Optional[datetime] = None
    days_overdue: float
    stability: float = 0.0
    ease_factor: float = 5.0
    retrievability: float = 0.0
    recommendation: StudyRecommendation


class StatsResponse(BaseModel):
    total_sessions: int
    due_today: int
    reviewed_today: int
    avg_stability: float


class ReviewPreviewResponse(BaseModel):
    id: int
    subject: str
    level: str
    time: int
    review_count: int
    stability: float
    difficulty: float
    retrievability: float
    again_days: int
    hard_days: int
    good_days: int
    easy_days: int
    recommendation: StudyRecommendation
