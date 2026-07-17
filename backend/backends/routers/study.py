import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session
from backends.database import get_db
from backends.dependencies import limiter
from backends.models import StudySession
from backends.schemas.study import (
    StudyRequest, StudyResponse, PreviewResponse,
    ReviewRequest, ReviewResponse,
    ReviewQueueItem, StatsResponse,
    ReviewPreviewResponse,
    StudyRecommendation,
)
from backends.services.study import (
    generate_recommendation, apply_fsrs,
    retrievability_now, predict_review_outcomes,
)
from backends.auth import get_current_user_id

router = APIRouter(
    prefix="/study",
    tags=["Study"]
)


@router.get("", response_model=list[StudyResponse])
def list_studies(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    return db.query(StudySession).filter(StudySession.user_id == user_id).all()


@router.post("", response_model=StudyResponse)
@limiter.limit("5/minute")
async def create_study(
    request: Request,
    payload: StudyRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    recommendation = await generate_recommendation(
        subject=payload.subject,
        level=payload.level,
        time=payload.time,
        goal=payload.goal,
    )

    try:
        parsed_user_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user identity in token")

    session = StudySession(
        user_id=parsed_user_id,
        time=payload.time,
        subject=payload.subject,
        level=payload.level,
        goal=payload.goal,
        recommendation=recommendation.model_dump(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


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
    )
    return PreviewResponse(
        subject=body.subject,
        time=body.time,
        level=body.level,
        goal=body.goal,
        recommendation=recommendation,
    )


@router.get("/review-queue", response_model=list[ReviewQueueItem])
def get_review_queue(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    now = datetime.now(timezone.utc)
    one_day_ago = now - timedelta(days=1)

    sessions = (
        db.query(StudySession)
        .filter(StudySession.user_id == user_id)
        .filter(or_(
            (StudySession.next_review_at == None) & (StudySession.created_at <= one_day_ago),
            StudySession.next_review_at <= now,
        ))
        .order_by(StudySession.next_review_at.asc().nullsfirst())
        .all()
    )

    result = []
    for s in sessions:
        if s.next_review_at:
            days_overdue = (now - s.next_review_at).total_seconds() / 86400
        else:
            days_overdue = (now - s.created_at).total_seconds() / 86400
        elapsed_since_review = (
            (now - s.last_reviewed_at).total_seconds() / 86400
            if s.last_reviewed_at else (now - s.created_at).total_seconds() / 86400
        )
        result.append(ReviewQueueItem(
            id=s.id,
            subject=s.subject,
            level=s.level,
            goal=s.goal,
            time=s.time,
            review_count=s.review_count,
            interval_days=s.interval_days,
            next_review_at=s.next_review_at,
            days_overdue=round(days_overdue, 2),
            stability=s.stability,
            ease_factor=s.ease_factor,
            retrievability=round(retrievability_now(s.stability, elapsed_since_review), 3),
            recommendation=StudyRecommendation(**s.recommendation),
        ))
    return result


@router.get("/{session_id}/review-preview", response_model=ReviewPreviewResponse)
def get_review_preview(
    session_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    session = db.query(StudySession).filter(
        StudySession.id == session_id,
        StudySession.user_id == user_id,
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

    total = db.query(StudySession).filter(StudySession.user_id == user_id).count()
    due_today = (
        db.query(StudySession)
        .filter(StudySession.user_id == user_id)
        .filter(or_(
            StudySession.next_review_at <= now,
            StudySession.next_review_at == None,
        ))
        .count()
    )
    reviewed_today = (
        db.query(StudySession)
        .filter(StudySession.user_id == user_id)
        .filter(StudySession.last_reviewed_at >= today_start)
        .count()
    )
    avg_s = (
        db.query(sqlfunc.avg(StudySession.stability))
        .filter(StudySession.user_id == user_id)
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
    session = (
        db.query(StudySession)
        .filter(StudySession.id == study_id, StudySession.user_id == user_id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Study session not found")
    return session


@router.post("/{session_id}/review", response_model=ReviewResponse)
def review_session(
    session_id: int,
    body: ReviewRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    session = db.query(StudySession).filter(
        StudySession.id == session_id,
        StudySession.user_id == user_id,
    ).first()
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
