import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
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
