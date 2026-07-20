from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import relationship
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
    exam_date = Column(Date, nullable=True)
    recommendation = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    next_review_at = Column(DateTime(timezone=True), nullable=True)
    review_count = Column(Integer, nullable=False, server_default="0")
    ease_factor = Column(Float, nullable=False, server_default="2.5")
    interval_days = Column(Integer, nullable=False, server_default="1")
    stability = Column(Float, nullable=False, server_default="0")

    concepts = relationship(
        "ConceptNode",
        back_populates="study_session",
        cascade="all, delete-orphan",
        order_by="ConceptNode.id",
    )
    edges = relationship(
        "ConceptEdge",
        back_populates="study_session",
        cascade="all, delete-orphan",
        order_by="ConceptEdge.id",
    )


class ConceptNode(Base):
    __tablename__ = "concept_nodes"
    __table_args__ = (
        UniqueConstraint("study_session_id", "key", name="uq_concept_nodes_session_key"),
        UniqueConstraint("study_session_id", "id", name="uq_concept_nodes_session_id"),
        CheckConstraint(
            "last_rating IS NULL OR (last_rating >= 1 AND last_rating <= 4)",
            name="ck_concept_nodes_last_rating_range",
        ),
    )

    id = Column(Integer, primary_key=True)
    study_session_id = Column(
        Integer, ForeignKey("study_sessions.id"), nullable=False, index=True
    )
    key = Column(String, nullable=False)
    title = Column(String, nullable=False)
    explanation = Column(String, nullable=False)
    retrieval_prompt = Column(String, nullable=False)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    next_review_at = Column(DateTime(timezone=True), nullable=True, index=True)
    review_count = Column(Integer, nullable=False, server_default="0")
    interval_days = Column(Integer, nullable=False, server_default="1")
    stability = Column(Float, nullable=False, server_default="0")
    difficulty = Column(Float, nullable=False, server_default="0")
    last_rating = Column(Integer, nullable=True)

    study_session = relationship("StudySession", back_populates="concepts")
    prerequisite_edges = relationship(
        "ConceptEdge",
        foreign_keys="ConceptEdge.prerequisite_node_id",
        back_populates="prerequisite_node",
    )
    dependent_edges = relationship(
        "ConceptEdge",
        foreign_keys="ConceptEdge.dependent_node_id",
        back_populates="dependent_node",
    )
    review_events = relationship(
        "ConceptReviewEvent", back_populates="concept_node", cascade="all, delete-orphan"
    )


class ConceptEdge(Base):
    __tablename__ = "concept_edges"
    __table_args__ = (
        UniqueConstraint(
            "study_session_id",
            "prerequisite_node_id",
            "dependent_node_id",
            name="uq_concept_edges_session_pair",
        ),
        CheckConstraint(
            "prerequisite_node_id <> dependent_node_id",
            name="ck_concept_edges_not_self_referential",
        ),
        ForeignKeyConstraint(
            ["study_session_id", "prerequisite_node_id"],
            ["concept_nodes.study_session_id", "concept_nodes.id"],
            name="fk_concept_edges_prerequisite_node_session",
        ),
        ForeignKeyConstraint(
            ["study_session_id", "dependent_node_id"],
            ["concept_nodes.study_session_id", "concept_nodes.id"],
            name="fk_concept_edges_dependent_node_session",
        ),
    )

    id = Column(Integer, primary_key=True)
    study_session_id = Column(
        Integer, ForeignKey("study_sessions.id"), nullable=False, index=True
    )
    prerequisite_node_id = Column(Integer, nullable=False, index=True)
    dependent_node_id = Column(Integer, nullable=False, index=True)

    study_session = relationship("StudySession", back_populates="edges")
    prerequisite_node = relationship(
        "ConceptNode",
        foreign_keys=[prerequisite_node_id],
        back_populates="prerequisite_edges",
    )
    dependent_node = relationship(
        "ConceptNode",
        foreign_keys=[dependent_node_id],
        back_populates="dependent_edges",
    )


class ConceptReviewEvent(Base):
    __tablename__ = "concept_review_events"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 4", name="ck_concept_review_events_rating"),
    )

    id = Column(Integer, primary_key=True)
    concept_node_id = Column(
        Integer, ForeignKey("concept_nodes.id"), nullable=False, index=True
    )
    rating = Column(Integer, nullable=False)
    answer = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    concept_node = relationship("ConceptNode", back_populates="review_events")
