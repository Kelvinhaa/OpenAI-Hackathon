import importlib.metadata
import inspect
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from openai import AsyncOpenAI
from packaging.version import Version

from backends.schemas.study import (
    GeneratedLearningExperience,
    RetrievalFeedbackResponse,
    StudyRecommendation,
    Technique,
)
from backends.services import study


def test_study_service_does_not_load_a_dotenv_file():
    service_source = Path(study.__file__).read_text()

    assert "load_dotenv" not in service_source


@pytest.mark.asyncio
async def test_openai_sdk_supports_async_structured_responses():
    assert Version(importlib.metadata.version("openai")) >= Version("1.109.0")

    sdk_client = AsyncOpenAI(api_key="test-key")
    try:
        parse_parameters = inspect.signature(sdk_client.responses.parse).parameters

        assert callable(sdk_client.responses.parse)
        assert "text_format" in parse_parameters
    finally:
        await sdk_client.close()


@pytest.mark.asyncio
async def test_generate_recommendation_uses_openai_structured_output(monkeypatch):
    expected = StudyRecommendation(
        summary="Use retrieval practice to connect Newton's laws to free-body diagrams.",
        techniques=[
            Technique(
                title="Active Recall",
                description="Sketch a free-body diagram from memory before checking each force.",
                duration_minutes=30,
            )
        ],
        tips=["Label each force before calculating acceleration."],
    )
    mock_client = Mock()
    mock_client.responses.parse = AsyncMock(
        return_value=SimpleNamespace(output_parsed=expected)
    )
    monkeypatch.setattr(study, "client", mock_client)

    result = await study.generate_recommendation(
        subject="Newton's laws", level="undergraduate", time=30, goal="solve force problems"
    )

    assert result == expected
    mock_client.responses.parse.assert_awaited_once_with(
        model="gpt-5.6-luna",
        instructions=study.SYSTEM_PROMPT,
        input=(
            "Create a study plan for:\n"
            "- Subject: Newton's laws\n"
            "- Level: undergraduate\n"
            "- Duration: 30 minutes\n"
            "- Learning goal: solve force problems"
        ),
        text_format=StudyRecommendation,
        reasoning={"effort": "low"},
    )


@pytest.mark.asyncio
async def test_generate_recommendation_returns_fallback_when_openai_fails(monkeypatch):
    mock_client = Mock()
    mock_client.responses.parse = AsyncMock(side_effect=RuntimeError("provider unavailable"))
    monkeypatch.setattr(study, "client", mock_client)

    result = await study.generate_recommendation(
        subject="Linear algebra", level="beginner", time=45
    )

    assert result.summary == "Study plan for Linear algebra (45 minutes, beginner level)"
    assert result.techniques[0].duration_minutes == 45


@pytest.mark.asyncio
async def test_generate_recommendation_returns_fallback_for_unparsed_openai_output(monkeypatch):
    mock_client = Mock()
    mock_client.responses.parse = AsyncMock(
        return_value=SimpleNamespace(output_parsed=None)
    )
    monkeypatch.setattr(study, "client", mock_client)

    result = await study.generate_recommendation(
        subject="Linear algebra", level="beginner", time=45
    )

    assert result.summary == "Study plan for Linear algebra (45 minutes, beginner level)"
    assert result.techniques[0].duration_minutes == 45


def _generated_learning_experience() -> GeneratedLearningExperience:
    return GeneratedLearningExperience(
        summary="A plan for Newton's laws.",
        techniques=[],
        tips=["Draw a free-body diagram before calculating."],
        concepts=[
            {
                "key": "force",
                "title": "Force",
                "explanation": "A push or pull acting on an object.",
                "retrieval_prompt": "What is a force?",
            },
            {
                "key": "mass",
                "title": "Mass",
                "explanation": "A measure of inertia.",
                "retrieval_prompt": "How does mass affect acceleration?",
            },
            {
                "key": "acceleration",
                "title": "Acceleration",
                "explanation": "The rate of velocity change.",
                "retrieval_prompt": "What does acceleration describe?",
            },
            {
                "key": "newtons-second-law",
                "title": "Newton's second law",
                "explanation": "Force, mass, and acceleration are related by F = ma.",
                "retrieval_prompt": "How do force, mass, and acceleration relate?",
            },
        ],
        edges=[
            {"prerequisite_key": "force", "dependent_key": "newtons-second-law"},
            {"prerequisite_key": "mass", "dependent_key": "newtons-second-law"},
            {"prerequisite_key": "acceleration", "dependent_key": "newtons-second-law"},
        ],
    )


@pytest.mark.asyncio
async def test_generate_learning_experience_uses_openai_typed_output(monkeypatch):
    expected = _generated_learning_experience()
    mock_client = Mock()
    mock_client.responses.parse = AsyncMock(
        return_value=SimpleNamespace(output_parsed=expected)
    )
    monkeypatch.setattr(study, "client", mock_client)

    result = await study.generate_learning_experience(
        subject="Newton's laws", level="undergraduate", time=30, goal="solve force problems"
    )

    assert result == expected
    mock_client.responses.parse.assert_awaited_once_with(
        model="gpt-5.6-luna",
        instructions=study.LEARNING_MAP_SYSTEM_PROMPT,
        input=(
            "Create a complete study plan and learning map for:\n"
            "- Subject: Newton's laws\n"
            "- Level: undergraduate\n"
            "- Duration: 30 minutes\n"
            "- Learning goal: solve force problems"
        ),
        text_format=GeneratedLearningExperience,
        reasoning={"effort": "low"},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "parse_result",
    [
        SimpleNamespace(output_parsed=None),
        RuntimeError("provider unavailable"),
    ],
)
async def test_generate_learning_experience_raises_for_failed_or_unparsed_output(
    monkeypatch, parse_result
):
    mock_client = Mock()
    if isinstance(parse_result, Exception):
        mock_client.responses.parse = AsyncMock(side_effect=parse_result)
    else:
        mock_client.responses.parse = AsyncMock(return_value=parse_result)
    monkeypatch.setattr(study, "client", mock_client)

    with pytest.raises(study.LearningExperienceGenerationError):
        await study.generate_learning_experience(
            subject="Newton's laws", level="undergraduate", time=30
        )


@pytest.mark.asyncio
async def test_evaluate_retrieval_answer_uses_bounded_structured_feedback(monkeypatch):
    expected = RetrievalFeedbackResponse(
        feedback="You named the outcome. Add how chromosomes separate before two nuclei form.",
        suggested_rating=3,
        prerequisite_concept_key="chromosomes",
    )
    mock_client = Mock()
    mock_client.responses.parse = AsyncMock(
        return_value=SimpleNamespace(output_parsed=expected.model_dump())
    )
    monkeypatch.setattr(study, "client", mock_client)

    concept = SimpleNamespace(
        title="Mitosis",
        explanation="Nuclear division creates matching nuclei.",
        retrieval_prompt="Why does mitosis create identical cells?",
    )
    result = await study.evaluate_retrieval_answer(
        concept=concept,
        answer="It creates two cells.",
        allowed_prerequisite_keys=["chromosomes", "cell-cycle"],
    )

    assert result == expected
    parse_call = mock_client.responses.parse.await_args.kwargs
    assert parse_call["model"] == "gpt-5.6-luna"
    assert parse_call["reasoning"] == {"effort": "low"}
    assert "two sentences" in parse_call["instructions"]
    assert "chromosomes, cell-cycle" in parse_call["input"]
