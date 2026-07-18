import re
import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Optional, List


class StudyRequest(BaseModel):
    time: int = Field(gt=0, description="Study duration in minutes")
    subject: str
    level: str
    goal: Optional[str] = Field(default=None, description="Optional learning goal")


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

        for edge in self.edges:
            if edge.prerequisite_key == edge.dependent_key:
                raise ValueError("a concept cannot be a prerequisite of itself")
            if edge.prerequisite_key not in concept_key_set:
                raise ValueError("edge prerequisite references an unknown concept")
            if edge.dependent_key not in concept_key_set:
                raise ValueError("edge dependent references an unknown concept")

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
    recommendation: StudyRecommendation
    created_at: Optional[datetime] = None
    last_reviewed_at: Optional[datetime] = None
    next_review_at: Optional[datetime] = None
    review_count: int = 0
    interval_days: int = 1
    stability: float = 0.0
    concepts: List[ConceptNodeResponse] = Field(default_factory=list)
    edges: List[ConceptEdgeResponse] = Field(default_factory=list)


class PreviewResponse(BaseModel):
    subject: str
    time: int
    level: str
    goal: Optional[str] = None
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
