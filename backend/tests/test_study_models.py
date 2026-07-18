import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from pydantic import ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from backends.database import Base
from backends.models import ConceptEdge, ConceptNode, ConceptReviewEvent, StudySession
from backends.schemas.study import ConceptNodeResponse, GeneratedLearningExperience


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


def _sqlite_engine(database_path):
    engine = create_engine(f"sqlite:///{database_path}")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    return engine


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


@pytest.mark.parametrize("concept_count", [3, 7])
def test_generated_experience_requires_between_four_and_six_concepts(concept_count):
    payload = _experience_payload()
    if concept_count == 3:
        payload["concepts"] = payload["concepts"][:3]
        payload["edges"] = payload["edges"][:1]
    else:
        payload["concepts"].extend(
            [
                {
                    "key": f"extra-{index}",
                    "title": f"Extra concept {index}",
                    "explanation": "An additional concept for validation.",
                    "retrieval_prompt": "What makes this concept additional?",
                }
                for index in range(3)
            ]
        )

    with pytest.raises(ValidationError, match="between 4 and 6"):
        GeneratedLearningExperience.model_validate(payload)


def test_generated_experience_rejects_edges_to_missing_nodes():
    payload = _experience_payload()
    payload["edges"][0]["prerequisite_key"] = "missing"

    with pytest.raises(ValidationError, match="unknown concept"):
        GeneratedLearningExperience.model_validate(payload)


def test_generated_experience_rejects_self_referential_edges():
    self_edge_payload = _experience_payload()
    self_edge_payload["edges"][0] = {
        "prerequisite_key": "mitosis",
        "dependent_key": "mitosis",
    }
    with pytest.raises(ValidationError, match="itself"):
        GeneratedLearningExperience.model_validate(self_edge_payload)


@pytest.mark.parametrize("field", ["key", "title", "explanation", "retrieval_prompt"])
def test_generated_experience_rejects_blank_concept_fields(field):
    payload = _experience_payload()
    payload["concepts"][0][field] = "   "

    with pytest.raises(ValidationError, match="must not be blank"):
        GeneratedLearningExperience.model_validate(payload)


@pytest.mark.parametrize("invalid_key", ["Cell Cycle", "cell_cycle", "cell--cycle"])
def test_generated_experience_requires_lowercase_kebab_case_concept_keys(invalid_key):
    payload = _experience_payload()
    payload["concepts"][0]["key"] = invalid_key
    payload["edges"][0]["prerequisite_key"] = invalid_key

    with pytest.raises(ValidationError, match="lowercase kebab-case"):
        GeneratedLearningExperience.model_validate(payload)


@pytest.mark.parametrize("last_rating", [0, 5])
def test_concept_node_response_rejects_ratings_outside_fsrs_range(last_rating):
    with pytest.raises(ValidationError):
        ConceptNodeResponse(
            id=1,
            key="mitosis",
            title="Mitosis",
            explanation="Nuclear division.",
            retrieval_prompt="What does mitosis produce?",
            review_count=0,
            interval_days=1,
            stability=0.0,
            difficulty=0.0,
            last_rating=last_rating,
        )


def test_study_session_relationships_order_concepts_and_edges_by_id():
    assert StudySession.concepts.property.order_by[0].key == "id"
    assert StudySession.edges.property.order_by[0].key == "id"


@pytest.mark.parametrize("field", ["prerequisite_key", "dependent_key"])
def test_generated_experience_rejects_blank_edge_keys(field):
    payload = _experience_payload()
    payload["edges"][0][field] = "   "

    with pytest.raises(ValidationError, match="must not be blank"):
        GeneratedLearningExperience.model_validate(payload)


def test_concept_nodes_belong_to_one_study_session_and_keep_fsrs_state(tmp_path):
    engine = _sqlite_engine(tmp_path / "study-models.db")
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
        assert node.interval_days == 1
        assert node.stability == 0
        assert node.difficulty == 0
        assert node.last_reviewed_at is None
        assert node.next_review_at is None
        assert node.last_rating is None
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_concept_constraints_reject_duplicate_keys_and_self_edges(tmp_path):
    engine = _sqlite_engine(tmp_path / "study-model-constraints.db")
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


def test_concept_edges_cannot_cross_study_session_boundaries(tmp_path):
    engine = _sqlite_engine(tmp_path / "study-model-ownership.db")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        first_study_session = _study_session()
        second_study_session = _study_session()
        session.add_all([first_study_session, second_study_session])
        session.flush()
        first_node = ConceptNode(
            study_session_id=first_study_session.id,
            key="cell-cycle",
            title="Cell cycle",
            explanation="The stages a cell follows before division.",
            retrieval_prompt="What are the cell-cycle stages?",
        )
        second_node = ConceptNode(
            study_session_id=second_study_session.id,
            key="mitosis",
            title="Mitosis",
            explanation="Nuclear division creates matching nuclei.",
            retrieval_prompt="What does mitosis produce?",
        )
        session.add_all([first_node, second_node])
        session.commit()

        cross_session_edge = ConceptEdge(
            study_session_id=first_study_session.id,
            prerequisite_node_id=first_node.id,
            dependent_node_id=second_node.id,
        )
        session.add(cross_session_edge)
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_review_event_attaches_to_its_concept_and_persists_fsrs_state(tmp_path):
    engine = _sqlite_engine(tmp_path / "study-model-reviews.db")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        study_session = _study_session()
        reviewed_at = datetime.now(timezone.utc)
        node = ConceptNode(
            study_session=study_session,
            key="mitosis",
            title="Mitosis",
            explanation="Nuclear division creates matching nuclei.",
            retrieval_prompt="What does mitosis produce?",
            last_reviewed_at=reviewed_at,
            next_review_at=reviewed_at + timedelta(days=4),
            review_count=2,
            interval_days=4,
            stability=3.5,
            difficulty=4.2,
            last_rating=3,
        )
        review_event = ConceptReviewEvent(rating=3, answer="It creates matching nuclei.")
        node.review_events.append(review_event)
        session.add(study_session)
        session.commit()

        assert review_event.concept_node is node
        assert node.review_events == [review_event]
        assert review_event.concept_node.study_session is study_session
        assert node.last_reviewed_at == reviewed_at.replace(tzinfo=None)
        assert node.next_review_at == (reviewed_at + timedelta(days=4)).replace(
            tzinfo=None
        )
        assert node.review_count == 2
        assert node.interval_days == 4
        assert node.stability == 3.5
        assert node.difficulty == 4.2
        assert node.last_rating == 3
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_concept_review_events_reject_ratings_outside_fsrs_range(tmp_path):
    engine = _sqlite_engine(tmp_path / "study-model-review-ratings.db")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        study_session = _study_session()
        node = ConceptNode(
            study_session=study_session,
            key="mitosis",
            title="Mitosis",
            explanation="Nuclear division creates matching nuclei.",
            retrieval_prompt="What does mitosis produce?",
        )
        session.add(node)
        session.commit()

        session.add(ConceptReviewEvent(concept_node_id=node.id, rating=0))
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_alembic_migration_chain_reaches_learning_map_head(tmp_path, monkeypatch):
    database_path = tmp_path / "migration-chain.db"
    backend_path = Path(__file__).resolve().parents[1]
    database_url = f"sqlite:///{database_path}"
    config = Config(str(backend_path / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    monkeypatch.setenv("DATABASE_URL", database_url)

    command.upgrade(config, "head")
