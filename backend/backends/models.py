from sqlalchemy import Column, Integer, String, JSON, Uuid, DateTime, Float
from sqlalchemy.sql import func
from backends.database import Base


class StudySession(Base):
    __tablename__ = "study_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), nullable=False, index=True)
    time = Column(Integer, nullable=False)
    subject = Column(String, nullable=False)
    level = Column(String, nullable=False)
    goal = Column(String, nullable=True)
    recommendation = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    next_review_at = Column(DateTime(timezone=True), nullable=True)
    review_count = Column(Integer, nullable=False, server_default="0")
    ease_factor = Column(Float, nullable=False, server_default="2.5")
    interval_days = Column(Integer, nullable=False, server_default="1")
    stability = Column(Float, nullable=False, server_default="0")
