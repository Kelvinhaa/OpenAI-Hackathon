import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session
from backends.database import get_db
from backends.dependencies import limiter
from backends.models import ConceptEdge, ConceptNode, ConceptReviewEvent, StudySession
from backends.schemas.study import (
    StudyRequest, StudyResponse, PreviewResponse,
    ReviewRequest, ReviewResponse,
    ConceptReviewQueueItem, ConceptReviewRequest, ConceptReviewResponse,
    RetrievalAnswerRequest, RetrievalFeedbackResult, StatsResponse,
    ReviewPreviewResponse,
    StudyRecommendation,
)
from backends.services.study import (
    LearningExperienceGenerationError, apply_fsrs, generate_learning_experience,
    generate_recommendation,
    RetrievalFeedbackGenerationError, evaluate_retrieval_answer,
    retrievability_now, predict_review_outcomes,
)
from backends.auth import get_current_user_id

router = APIRouter(
    prefix="/study",
    tags=["Study"]
)


def _parse_user_id(user_id: str | uuid.UUID) -> uuid.UUID:
    try:
        return user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(user_id)
    except (AttributeError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identity in token",
        ) from exc


def _owned_concept_query(
    db: Session,
    concept_id: int,
    user_id: str | uuid.UUID,
    *,
    lock_for_update: bool = False,
):
    parsed_user_id = _parse_user_id(user_id)
    query = (
        db.query(ConceptNode)
        .join(StudySession, ConceptNode.study_session_id == StudySession.id)
        .filter(
            ConceptNode.id == concept_id,
            StudySession.user_id == parsed_user_id,
        )
    )
    return query.with_for_update() if lock_for_update else query


def _owned_concept_or_404(
    db: Session,
    concept_id: int,
    user_id: str | uuid.UUID,
    *,
    lock_for_update: bool = False,
) -> ConceptNode:
    concept = _owned_concept_query(
        db, concept_id, user_id, lock_for_update=lock_for_update
    ).first()
    if concept is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return concept


def _study_response(session: StudySession, db: Session) -> StudyResponse:
    concepts = (
        db.query(ConceptNode)
        .filter(ConceptNode.study_session_id == session.id)
        .order_by(ConceptNode.id)
        .all()
    )
    edges = (
        db.query(ConceptEdge)
        .filter(ConceptEdge.study_session_id == session.id)
        .order_by(ConceptEdge.id)
        .all()
    )
    due_concept_count = (
        db.query(ConceptNode)
        .filter(
            ConceptNode.study_session_id == session.id,
            ConceptNode.next_review_at.is_not(None),
            ConceptNode.next_review_at <= datetime.now(timezone.utc),
        )
        .count()
    )
    if concepts:
        scheduled_concepts = [
            concept for concept in concepts if concept.next_review_at is not None
        ]
        next_review_concept = min(
            scheduled_concepts,
            key=lambda concept: concept.next_review_at,
            default=None,
        )
        reviewed_concepts = [
            concept for concept in concepts if concept.last_reviewed_at is not None
        ]
        last_reviewed_at = max(
            (concept.last_reviewed_at for concept in reviewed_concepts),
            default=None,
        )
        next_review_at = (
            next_review_concept.next_review_at if next_review_concept is not None else None
        )
        review_count = sum(concept.review_count for concept in concepts)
        interval_days = (
            next_review_concept.interval_days if next_review_concept is not None else 1
        )
        stability = sum(concept.stability for concept in concepts) / len(concepts)
    else:
        last_reviewed_at = session.last_reviewed_at
        next_review_at = session.next_review_at
        review_count = session.review_count
        interval_days = session.interval_days
        stability = session.stability

    return StudyResponse(
        id=session.id,
        user_id=session.user_id,
        time=session.time,
        subject=session.subject,
        level=session.level,
        goal=session.goal,
        exam_date=session.exam_date,
        recommendation=session.recommendation,
        created_at=session.created_at,
        last_reviewed_at=last_reviewed_at,
        next_review_at=next_review_at,
        review_count=review_count,
        interval_days=interval_days,
        stability=stability,
        concept_count=len(concepts),
        due_concept_count=due_concept_count,
        concepts=concepts,
        edges=edges,
    )


@router.get("", response_model=list[StudyResponse])
def list_studies(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    parsed_user_id = _parse_user_id(user_id)
    sessions = db.query(StudySession).filter(StudySession.user_id == parsed_user_id).all()
    return [_study_response(session, db) for session in sessions]


@router.post("", response_model=StudyResponse)
@limiter.limit("5/minute")
async def create_study(
    request: Request,
    payload: StudyRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    try:
        experience = await generate_learning_experience(
            subject=payload.subject,
            level=payload.level,
            time=payload.time,
            goal=payload.goal,
            exam_date=payload.exam_date,
        )
    except LearningExperienceGenerationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Learning map generation is temporarily unavailable. Please try again.",
        )

    parsed_user_id = _parse_user_id(user_id)

    recommendation = StudyRecommendation(
        summary=experience.summary,
        techniques=experience.techniques,
        tips=experience.tips,
    )
    try:
        session = StudySession(
            user_id=parsed_user_id,
            time=payload.time,
            subject=payload.subject,
            level=payload.level,
            goal=payload.goal,
            exam_date=payload.exam_date,
            recommendation=recommendation.model_dump(),
        )
        db.add(session)
        db.flush()

        nodes_by_key = {}
        for concept in experience.concepts:
            node = ConceptNode(
                study_session_id=session.id,
                key=concept.key,
                title=concept.title,
                explanation=concept.explanation,
                retrieval_prompt=concept.retrieval_prompt,
            )
            db.add(node)
            nodes_by_key[concept.key] = node
        db.flush()

        for edge in experience.edges:
            db.add(
                ConceptEdge(
                    study_session_id=session.id,
                    prerequisite_node_id=nodes_by_key[edge.prerequisite_key].id,
                    dependent_node_id=nodes_by_key[edge.dependent_key].id,
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(session)
    return _study_response(session, db)


@router.post("/preview", response_model=PreviewResponse)
@limiter.limit("3/hour")
async def preview_study(
    request: Request,
    body: StudyRequest,
    db: Session = Depends(get_db),
):
    recommendation = await generate_recommendation(
        subject=body.subject,
        level=body.level,
        time=body.time,
        goal=body.goal,
        exam_date=body.exam_date,
    )
    return PreviewResponse(
        subject=body.subject,
        time=body.time,
        level=body.level,
        goal=body.goal,
        exam_date=body.exam_date,
        recommendation=recommendation,
    )


@router.get("/review-queue", response_model=list[ConceptReviewQueueItem])
def get_review_queue(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    now = datetime.now(timezone.utc)
    parsed_user_id = _parse_user_id(user_id)
    due_concepts = (
        db.query(ConceptNode, StudySession.subject)
        .join(StudySession, ConceptNode.study_session_id == StudySession.id)
        .filter(
            StudySession.user_id == parsed_user_id,
            ConceptNode.next_review_at.is_not(None),
            ConceptNode.next_review_at <= now,
        )
        .order_by(ConceptNode.next_review_at.asc())
        .all()
    )
    return [
        ConceptReviewQueueItem(
            id=concept.id,
            key=concept.key,
            title=concept.title,
            explanation=concept.explanation,
            retrieval_prompt=concept.retrieval_prompt,
            last_reviewed_at=concept.last_reviewed_at,
            next_review_at=concept.next_review_at,
            review_count=concept.review_count,
            interval_days=concept.interval_days,
            stability=concept.stability,
            difficulty=concept.difficulty,
            last_rating=concept.last_rating,
            subject=subject,
        )
        for concept, subject in due_concepts
    ]


@router.post(
    "/concepts/{concept_id}/feedback", response_model=RetrievalFeedbackResult
)
async def get_concept_feedback(
    concept_id: int,
    body: RetrievalAnswerRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    concept = _owned_concept_or_404(db, concept_id, user_id)
    prerequisite_concepts = (
        db.query(ConceptNode)
        .join(
            ConceptEdge,
            ConceptEdge.prerequisite_node_id == ConceptNode.id,
        )
        .filter(
            ConceptNode.study_session_id == concept.study_session_id,
            ConceptEdge.study_session_id == concept.study_session_id,
            ConceptEdge.dependent_node_id == concept.id,
        )
        .order_by(ConceptNode.key)
        .all()
    )
    allowed_prerequisite_keys = [node.key for node in prerequisite_concepts]
    try:
        feedback = await evaluate_retrieval_answer(
            concept=concept,
            answer=body.answer,
            allowed_prerequisite_keys=allowed_prerequisite_keys,
        )
    except RetrievalFeedbackGenerationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Retrieval feedback is temporarily unavailable. Please try again.",
        )

    prerequisite_concept_id = next(
        (
            node.id
            for node in prerequisite_concepts
            if node.key == feedback.prerequisite_concept_key
        ),
        None,
    )

    return RetrievalFeedbackResult(
        feedback=feedback.feedback,
        suggested_rating=feedback.suggested_rating,
        prerequisite_concept_id=prerequisite_concept_id,
    )


@router.post(
    "/concepts/{concept_id}/review", response_model=ConceptReviewResponse
)
def review_concept(
    concept_id: int,
    body: ConceptReviewRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    concept = _owned_concept_or_404(db, concept_id, user_id, lock_for_update=True)
    now = datetime.now(timezone.utc)
    last_reviewed_at = concept.last_reviewed_at
    if last_reviewed_at is not None and last_reviewed_at.tzinfo is None:
        last_reviewed_at = last_reviewed_at.replace(tzinfo=timezone.utc)
    elapsed_days = (
        (now - last_reviewed_at).total_seconds() / 86_400
        if last_reviewed_at is not None
        else None
    )
    interval_days, stability, difficulty = apply_fsrs(
        stability=concept.stability,
        difficulty=concept.difficulty,
        review_count=concept.review_count,
        rating=body.rating,
        elapsed_days=elapsed_days,
    )

    concept.last_reviewed_at = now
    concept.next_review_at = now + timedelta(days=interval_days)
    concept.review_count += 1
    concept.interval_days = interval_days
    concept.stability = stability
    concept.difficulty = difficulty
    concept.last_rating = body.rating
    db.add(
        ConceptReviewEvent(
            concept_node_id=concept.id,
            rating=body.rating,
            answer=body.answer,
            reviewed_at=now,
        )
    )
    db.commit()
    db.refresh(concept)
    return concept


@router.get("/{session_id}/review-preview", response_model=ReviewPreviewResponse)
def get_review_preview(
    session_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    parsed_user_id = _parse_user_id(user_id)
    session = db.query(StudySession).filter(
        StudySession.id == session_id,
        StudySession.user_id == parsed_user_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.now(timezone.utc)
    elapsed = (
        (now - session.last_reviewed_at).total_seconds() / 86400
        if session.last_reviewed_at else (now - session.created_at).total_seconds() / 86400
    )
    outcomes = predict_review_outcomes(
        stability=session.stability,
        difficulty=session.ease_factor,
        review_count=session.review_count,
        elapsed_days=elapsed,
    )

    return ReviewPreviewResponse(
        id=session.id,
        subject=session.subject,
        level=session.level,
        time=session.time,
        review_count=session.review_count,
        stability=session.stability,
        difficulty=session.ease_factor,
        retrievability=round(retrievability_now(session.stability, elapsed), 3),
        again_days=outcomes[1],
        hard_days=outcomes[2],
        good_days=outcomes[3],
        easy_days=outcomes[4],
        recommendation=StudyRecommendation(**session.recommendation),
    )


@router.get("/stats", response_model=StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    parsed_user_id = _parse_user_id(user_id)

    total = db.query(StudySession).filter(StudySession.user_id == parsed_user_id).count()
    due_today = (
        db.query(ConceptNode)
        .join(StudySession, ConceptNode.study_session_id == StudySession.id)
        .filter(
            StudySession.user_id == parsed_user_id,
            ConceptNode.next_review_at.is_not(None),
            ConceptNode.next_review_at <= now,
        )
        .count()
    )
    reviewed_today = (
        db.query(ConceptReviewEvent)
        .join(ConceptNode, ConceptReviewEvent.concept_node_id == ConceptNode.id)
        .join(StudySession, ConceptNode.study_session_id == StudySession.id)
        .filter(
            StudySession.user_id == parsed_user_id,
            ConceptReviewEvent.reviewed_at >= today_start,
        )
        .count()
    )
    avg_s = (
        db.query(sqlfunc.avg(ConceptNode.stability))
        .join(StudySession, ConceptNode.study_session_id == StudySession.id)
        .filter(StudySession.user_id == parsed_user_id)
        .scalar()
    )

    return StatsResponse(
        total_sessions=total,
        due_today=due_today,
        reviewed_today=reviewed_today,
        avg_stability=round(float(avg_s or 0.0), 2),
    )


@router.get("/{study_id}", response_model=StudyResponse)
def get_study(
    study_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    parsed_user_id = _parse_user_id(user_id)
    session = (
        db.query(StudySession)
        .filter(StudySession.id == study_id, StudySession.user_id == parsed_user_id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Study session not found")
    return _study_response(session, db)


@router.post("/{session_id}/review", response_model=ReviewResponse)
def review_session(
    session_id: int,
    body: ReviewRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    parsed_user_id = _parse_user_id(user_id)
    session = db.query(StudySession).filter(
        StudySession.id == session_id,
        StudySession.user_id == parsed_user_id,
    ).with_for_update().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.now(timezone.utc)
    elapsed = (
        (now - session.last_reviewed_at).total_seconds() / 86400
        if session.last_reviewed_at else None
    )

    new_interval, new_stability, new_difficulty = apply_fsrs(
        stability=session.stability,
        difficulty=session.ease_factor,
        review_count=session.review_count,
        rating=body.rating,
        elapsed_days=elapsed,
    )

    session.last_reviewed_at = now
    session.next_review_at = now + timedelta(days=new_interval)
    session.review_count = session.review_count + 1
    session.ease_factor = new_difficulty
    session.interval_days = new_interval
    session.stability = new_stability
    db.commit()
    db.refresh(session)
    return session
