import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from backends.database import Base
from backends.models import ConceptEdge, ConceptNode, StudySession
from backends.schemas.study import GeneratedLearningExperience


def _experience_payload() -> dict:
    return {
        "summary": "A concise plan for understanding cell division.",
        "techniques": [],
        "tips": [],
        "concepts": [
            {
                "key": "cell-cycle",
                "title": "Cell cycle",
                "explanation": "The stages a cell follows before division.",
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
                "explanation": "Division of the cell's cytoplasm.",
                "retrieval_prompt": "When does cytokinesis happen?",
            },
        ],
        "edges": [
            {"prerequisite_key": "cell-cycle", "dependent_key": "mitosis"},
            {"prerequisite_key": "chromosomes", "dependent_key": "mitosis"},
            {"prerequisite_key": "mitosis", "dependent_key": "cytokinesis"},
        ],
    }


def _study_session() -> StudySession:
    return StudySession(
        user_id=uuid.uuid4(),
        time=30,
        subject="Biology",
        level="Beginner",
        recommendation={"summary": "Plan", "techniques": [], "tips": []},
    )


def test_generated_experience_accepts_valid_unique_concepts_and_edges():
    experience = GeneratedLearningExperience.model_validate(_experience_payload())

    assert [concept.key for concept in experience.concepts] == [
        "cell-cycle",
        "chromosomes",
        "mitosis",
        "cytokinesis",
    ]


def test_generated_experience_rejects_duplicate_concept_keys():
    payload = _experience_payload()
    payload["concepts"][3]["key"] = "mitosis"

    with pytest.raises(ValidationError, match="unique"):
        GeneratedLearningExperience.model_validate(payload)


def test_generated_experience_rejects_edges_to_missing_nodes():
    payload = _experience_payload()
    payload["edges"][0]["prerequisite_key"] = "missing"

    with pytest.raises(ValidationError, match="unknown concept"):
        GeneratedLearningExperience.model_validate(payload)


def test_generated_experience_rejects_self_referential_edges_and_blank_content():
    self_edge_payload = _experience_payload()
    self_edge_payload["edges"][0] = {
        "prerequisite_key": "mitosis",
        "dependent_key": "mitosis",
    }
    with pytest.raises(ValidationError, match="itself"):
        GeneratedLearningExperience.model_validate(self_edge_payload)

    blank_content_payload = _experience_payload()
    blank_content_payload["concepts"][0]["explanation"] = "   "
    with pytest.raises(ValidationError, match="must not be blank"):
        GeneratedLearningExperience.model_validate(blank_content_payload)


def test_concept_nodes_belong_to_one_study_session_and_keep_fsrs_state(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'study-models.db'}")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        study_session = _study_session()
        session.add(study_session)
        session.flush()

        node = ConceptNode(
            study_session_id=study_session.id,
            key="mitosis",
            title="Mitosis",
            explanation="Cell division creates matching nuclei.",
            retrieval_prompt="What does mitosis produce?",
        )
        session.add(node)
        session.commit()

        assert node.study_session_id == study_session.id
        assert study_session.concepts == [node]
        assert node.review_count == 0
        assert node.stability == 0
        assert node.difficulty == 0
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_concept_constraints_reject_duplicate_keys_and_self_edges(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'study-model-constraints.db'}")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        study_session = _study_session()
        session.add(study_session)
        session.flush()
        first = ConceptNode(
            study_session_id=study_session.id,
            key="mitosis",
            title="Mitosis",
            explanation="Cell division creates matching nuclei.",
            retrieval_prompt="What does mitosis produce?",
        )
        session.add(first)
        session.commit()

        duplicate = ConceptNode(
            study_session_id=study_session.id,
            key="mitosis",
            title="Mitosis duplicate",
            explanation="A second copy should fail.",
            retrieval_prompt="Why is this duplicate invalid?",
        )
        session.add(duplicate)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        edge = ConceptEdge(
            study_session_id=study_session.id,
            prerequisite_node_id=first.id,
            dependent_node_id=first.id,
        )
        session.add(edge)
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
