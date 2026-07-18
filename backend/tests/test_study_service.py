import importlib.metadata
import inspect
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from openai import AsyncOpenAI
from packaging.version import Version

from backends.schemas.study import StudyRecommendation, Technique
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
        model="gpt-5.6",
        instructions=study.SYSTEM_PROMPT,
        input=(
            "Create a study plan for:\n"
            "- Subject: Newton's laws\n"
            "- Level: undergraduate\n"
            "- Duration: 30 minutes\n"
            "- Learning goal: solve force problems"
        ),
        text_format=StudyRecommendation,
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
