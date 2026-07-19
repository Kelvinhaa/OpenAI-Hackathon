import uuid
from datetime import datetime, timedelta, timezone

import pytest

from backends.auth import get_current_user_id
from backends.main import app
from backends.models import ConceptEdge, ConceptNode, ConceptReviewEvent, StudySession
from backends.routers import study as study_router
from backends.schemas.study import (
    GeneratedLearningExperience,
    RetrievalFeedbackResponse,
    StudyResponse,
)

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def generated_learning_experience() -> GeneratedLearningExperience:
    return GeneratedLearningExperience(
        summary="A study plan for understanding cell division.",
        techniques=[],
        tips=["Draw each stage from memory before checking your notes."],
        concepts=[
            {
                "key": "cell-cycle",
                "title": "Cell cycle",
                "explanation": "The stages a cell completes before division.",
                "retrieval_prompt": "What are the major cell-cycle stages?",
            },
            {
                "key": "chromosomes",
                "title": "Chromosomes",
                "explanation": "Structures that package genetic material.",
                "retrieval_prompt": "What do chromosomes contain?",
            },
            {
                "key": "mitosis",
                "title": "Mitosis",
                "explanation": "Nuclear division that creates matching nuclei.",
                "retrieval_prompt": "What does mitosis produce?",
            },
            {
                "key": "cytokinesis",
                "title": "Cytokinesis",
                "explanation": "Division of a cell's cytoplasm.",
                "retrieval_prompt": "When does cytokinesis happen?",
            },
        ],
        edges=[
            {"prerequisite_key": "cell-cycle", "dependent_key": "mitosis"},
            {"prerequisite_key": "chromosomes", "dependent_key": "mitosis"},
            {"prerequisite_key": "mitosis", "dependent_key": "cytokinesis"},
        ],
    )


def test_create_study_persists_and_returns_learning_map(
    client, monkeypatch, generated_learning_experience
):
    async def fake_generate_learning_experience(**_kwargs):
        return generated_learning_experience

    monkeypatch.setattr(
        study_router, "generate_learning_experience", fake_generate_learning_experience
    )

    response = client.post(
        "/study",
        json={
            "subject": "Cell division",
            "time": 45,
            "level": "intermediate",
            "goal": "Prepare for a quiz",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["concepts"]) == 4
    assert len(body["edges"]) == 3
    assert body["concept_count"] == 4
    assert body["due_concept_count"] == 0
    assert body["concepts"][0]["key"] == "cell-cycle"
    assert body["concepts"][0]["retrieval_prompt"]
    assert set(body["concepts"][0]) == {
        "id",
        "key",
        "title",
        "explanation",
        "retrieval_prompt",
        "last_reviewed_at",
        "next_review_at",
        "review_count",
        "interval_days",
        "stability",
        "difficulty",
        "last_rating",
    }
    concept_ids = {concept["id"] for concept in body["concepts"]}
    assert body["edges"][0]["prerequisite_node_id"] in concept_ids
    assert body["edges"][0]["dependent_node_id"] in concept_ids


def test_generation_error_returns_502_without_storing_a_study(
    client, db_session, monkeypatch
):
    async def fail_generation(**_kwargs):
        raise study_router.LearningExperienceGenerationError()

    monkeypatch.setattr(study_router, "generate_learning_experience", fail_generation)

    response = client.post(
        "/study",
        json={"subject": "Cell division", "time": 45, "level": "intermediate"},
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Learning map generation is temporarily unavailable. Please try again."
    }
    assert db_session.query(StudySession).count() == 0


def test_persistence_failure_rolls_back_flushed_session_nodes_and_edges(
    client, db_session, monkeypatch, generated_learning_experience
):
    async def fake_generate_learning_experience(**_kwargs):
        return generated_learning_experience

    def fail_final_commit_after_flushing_edges(self):
        self.flush()
        assert self.query(StudySession).count() == 1
        assert self.query(ConceptNode).count() == 4
        assert self.query(ConceptEdge).count() == 3
        raise RuntimeError("final commit failed")

    monkeypatch.setattr(
        study_router, "generate_learning_experience", fake_generate_learning_experience
    )
    monkeypatch.setattr(study_router.Session, "commit", fail_final_commit_after_flushing_edges)

    with pytest.raises(RuntimeError, match="final commit failed"):
        client.post(
            "/study",
            json={"subject": "Cell division", "time": 45, "level": "intermediate"},
        )

    assert db_session.query(StudySession).count() == 0
    assert db_session.query(ConceptNode).count() == 0
    assert db_session.query(ConceptEdge).count() == 0


def test_study_is_owned_by_authenticated_user_and_hidden_from_other_users(
    client, db_session, monkeypatch, generated_learning_experience
):
    async def fake_generate_learning_experience(**_kwargs):
        return generated_learning_experience

    monkeypatch.setattr(
        study_router, "generate_learning_experience", fake_generate_learning_experience
    )

    created = client.post(
        "/study",
        json={"subject": "Cell division", "time": 45, "level": "intermediate"},
    )

    assert created.status_code == 200
    body = created.json()
    assert body["user_id"] == TEST_USER_ID
    assert body["concepts"]
    assert body["edges"]
    persisted = db_session.query(StudySession).one()
    assert persisted.user_id == uuid.UUID(TEST_USER_ID)

    other_user_id = uuid.uuid4()
    monkeypatch.setitem(
        app.dependency_overrides, get_current_user_id, lambda: other_user_id
    )
    response = client.get(f"/study/{body['id']}")

    assert response.status_code == 404


def test_study_responses_include_per_map_concept_counts_and_order_related_records(db_session):
    user_id = uuid.uuid4()
    session = StudySession(
        user_id=user_id,
        time=30,
        subject="Cell division",
        level="intermediate",
        recommendation={"summary": "Plan", "techniques": [], "tips": []},
    )
    db_session.add(session)
    db_session.flush()
    nodes = [
        ConceptNode(
            id=2,
            study_session_id=session.id,
            key="mitosis",
            title="Mitosis",
            explanation="Nuclear division.",
            retrieval_prompt="What does mitosis produce?",
        ),
        ConceptNode(
            id=1,
            study_session_id=session.id,
            key="cell-cycle",
            title="Cell cycle",
            explanation="The stages before division.",
            retrieval_prompt="What are the cell-cycle stages?",
        ),
    ]
    db_session.add_all(nodes)
    db_session.flush()
    nodes[0].next_review_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.add(
        ConceptEdge(
            id=2,
            study_session_id=session.id,
            prerequisite_node_id=nodes[0].id,
            dependent_node_id=nodes[1].id,
        )
    )
    db_session.add(
        ConceptEdge(
            id=1,
            study_session_id=session.id,
            prerequisite_node_id=nodes[1].id,
            dependent_node_id=nodes[0].id,
        )
    )
    db_session.commit()
    db_session.expire(session)

    listed = study_router.list_studies(db=db_session, user_id=user_id)
    fetched = study_router.get_study(study_id=session.id, db=db_session, user_id=user_id)

    assert listed[0].concept_count == 2
    assert listed[0].due_concept_count == 1
    assert fetched.concept_count == 2
    assert fetched.due_concept_count == 1
    assert [concept.id for concept in StudyResponse.model_validate(listed[0]).concepts] == [1, 2]
    assert [edge.id for edge in StudyResponse.model_validate(listed[0]).edges] == [1, 2]
    assert [concept.id for concept in StudyResponse.model_validate(fetched).concepts] == [1, 2]
    assert [edge.id for edge in StudyResponse.model_validate(fetched).edges] == [1, 2]


def _concept_for_user(db_session, user_id, *, key="mitosis", next_review_at=None):
    session = StudySession(
        user_id=user_id,
        time=45,
        subject="Cell division",
        level="intermediate",
        recommendation={"summary": "Plan", "techniques": [], "tips": []},
    )
    db_session.add(session)
    db_session.flush()
    concept = ConceptNode(
        study_session_id=session.id,
        key=key,
        title="Mitosis",
        explanation="Nuclear division creates matching nuclei.",
        retrieval_prompt="Why does mitosis create identical cells?",
        next_review_at=next_review_at,
    )
    db_session.add(concept)
    db_session.commit()
    return concept


def test_feedback_does_not_change_concept_fsrs_state(client, db_session, monkeypatch):
    concept = _concept_for_user(db_session, uuid.UUID(TEST_USER_ID))

    async def fake_feedback(**_kwargs):
        return RetrievalFeedbackResponse(
            feedback="You named the outcome. Explain chromosome separation next.",
            suggested_rating=3,
        )

    monkeypatch.setattr(study_router, "evaluate_retrieval_answer", fake_feedback)
    before = (concept.review_count, concept.stability, concept.next_review_at)

    response = client.post(
        f"/study/concepts/{concept.id}/feedback",
        json={"answer": "It creates two identical cells."},
    )

    db_session.expire_all()
    persisted = db_session.get(ConceptNode, concept.id)
    assert response.status_code == 200
    assert response.json() == {
        "feedback": "You named the outcome. Explain chromosome separation next.",
        "suggested_rating": 3,
        "prerequisite_concept_id": None,
    }
    assert (persisted.review_count, persisted.stability, persisted.next_review_at) == before
    assert db_session.query(ConceptReviewEvent).count() == 0


def test_feedback_rejects_a_concept_owned_by_another_user(client, db_session):
    other_concept = _concept_for_user(db_session, uuid.uuid4())

    response = client.post(
        f"/study/concepts/{other_concept.id}/feedback",
        json={"answer": "It makes two cells."},
    )

    assert response.status_code == 404


def test_feedback_maps_a_prerequisite_key_to_the_parent_session_concept_id(
    client, db_session, monkeypatch
):
    concept = _concept_for_user(db_session, uuid.UUID(TEST_USER_ID))
    prerequisite = ConceptNode(
        study_session_id=concept.study_session_id,
        key="chromosomes",
        title="Chromosomes",
        explanation="Structures that package genetic material.",
        retrieval_prompt="What do chromosomes contain?",
    )
    db_session.add(prerequisite)
    db_session.flush()
    db_session.add(
        ConceptEdge(
            study_session_id=concept.study_session_id,
            prerequisite_node_id=prerequisite.id,
            dependent_node_id=concept.id,
        )
    )
    db_session.commit()

    async def fake_feedback(**_kwargs):
        assert _kwargs["allowed_prerequisite_keys"] == ["chromosomes"]
        return RetrievalFeedbackResponse(
            feedback="You named the outcome. Explain chromosome separation next.",
            suggested_rating=3,
            prerequisite_concept_key="chromosomes",
        )

    monkeypatch.setattr(study_router, "evaluate_retrieval_answer", fake_feedback)

    response = client.post(
        f"/study/concepts/{concept.id}/feedback",
        json={"answer": "It creates two identical cells."},
    )

    assert response.status_code == 200
    assert response.json()["prerequisite_concept_id"] == prerequisite.id


def test_feedback_drops_a_key_that_is_not_a_direct_prerequisite(
    client, db_session, monkeypatch
):
    concept = _concept_for_user(db_session, uuid.UUID(TEST_USER_ID))
    unrelated = ConceptNode(
        study_session_id=concept.study_session_id,
        key="cell-cycle",
        title="Cell cycle",
        explanation="The stages a cell completes before division.",
        retrieval_prompt="What are the major cell-cycle stages?",
    )
    db_session.add(unrelated)
    db_session.commit()

    async def fake_feedback(**_kwargs):
        assert _kwargs["allowed_prerequisite_keys"] == []
        return RetrievalFeedbackResponse(
            feedback="Review the prerequisite first.",
            suggested_rating=2,
            prerequisite_concept_key="cell-cycle",
        )

    monkeypatch.setattr(study_router, "evaluate_retrieval_answer", fake_feedback)

    response = client.post(
        f"/study/concepts/{concept.id}/feedback",
        json={"answer": "It creates two identical cells."},
    )

    assert response.status_code == 200
    assert response.json()["prerequisite_concept_id"] is None


def test_review_rejects_a_concept_owned_by_another_user(client, db_session, monkeypatch):
    other_concept = _concept_for_user(db_session, uuid.uuid4())

    response = client.post(
        f"/study/concepts/{other_concept.id}/review",
        json={"rating": 3, "answer": "It makes two cells."},
    )

    assert response.status_code == 404


def test_review_updates_owned_concept_and_creates_an_event(client, db_session, monkeypatch):
    concept = _concept_for_user(db_session, uuid.UUID(TEST_USER_ID))

    response = client.post(
        f"/study/concepts/{concept.id}/review",
        json={"rating": 3, "answer": "It separates chromosomes then forms two nuclei."},
    )

    db_session.expire_all()
    persisted = db_session.get(ConceptNode, concept.id)
    event = db_session.query(ConceptReviewEvent).one()
    assert response.status_code == 200
    assert response.json()["last_rating"] == 3
    assert response.json()["review_count"] == 1
    assert persisted.next_review_at is not None
    assert persisted.review_count == 1
    assert event.concept_node_id == concept.id
    assert event.rating == 3
    assert event.answer == "It separates chromosomes then forms two nuclei."


def test_review_queue_returns_only_due_concepts_for_the_current_user(client, db_session):
    from datetime import datetime, timedelta, timezone

    due = _concept_for_user(
        db_session,
        uuid.UUID(TEST_USER_ID),
        key="mitosis-due",
        next_review_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    _concept_for_user(
        db_session,
        uuid.UUID(TEST_USER_ID),
        key="mitosis-later",
        next_review_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    _concept_for_user(
        db_session,
        uuid.uuid4(),
        key="mitosis-other-user",
        next_review_at=datetime.now(timezone.utc) - timedelta(minutes=2),
    )
    _concept_for_user(db_session, uuid.UUID(TEST_USER_ID), key="mitosis-new")

    response = client.get("/study/review-queue")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [due.id]
    assert response.json()[0]["retrieval_prompt"] == "Why does mitosis create identical cells?"
    assert response.json()[0]["subject"] == "Cell division"
