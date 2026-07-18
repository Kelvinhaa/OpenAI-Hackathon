import uuid

import pytest

from backends.models import ConceptEdge, ConceptNode, StudySession
from backends.routers import study as study_router
from backends.schemas.study import GeneratedLearningExperience, StudyResponse


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

    def fail_to_create_edge(**_kwargs):
        raise RuntimeError("edge persistence failed")

    monkeypatch.setattr(
        study_router, "generate_learning_experience", fake_generate_learning_experience
    )
    monkeypatch.setattr(study_router, "ConceptEdge", fail_to_create_edge)

    with pytest.raises(RuntimeError, match="edge persistence failed"):
        client.post(
            "/study",
            json={"subject": "Cell division", "time": 45, "level": "intermediate"},
        )

    assert db_session.query(StudySession).count() == 0
    assert db_session.query(ConceptNode).count() == 0
    assert db_session.query(ConceptEdge).count() == 0


def test_legacy_study_responses_order_concepts_and_edges_by_id(db_session):
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

    assert [concept.id for concept in StudyResponse.model_validate(listed[0]).concepts] == [1, 2]
    assert [edge.id for edge in StudyResponse.model_validate(listed[0]).edges] == [1, 2]
    assert [concept.id for concept in StudyResponse.model_validate(fetched).concepts] == [1, 2]
    assert [edge.id for edge in StudyResponse.model_validate(fetched).edges] == [1, 2]
