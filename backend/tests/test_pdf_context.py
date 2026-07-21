from types import SimpleNamespace

import pytest

from backends.services import pdf_context


def _reader(*page_texts: str, encrypted: bool = False):
    return SimpleNamespace(
        is_encrypted=encrypted,
        pages=[
            SimpleNamespace(extract_text=lambda text=text: text)
            for text in page_texts
        ],
    )


def test_extract_pdf_context_keeps_page_markers_and_all_text(monkeypatch):
    monkeypatch.setattr(
        pdf_context, "PdfReader", lambda _stream: _reader("alpha", "beta")
    )

    result = pdf_context.extract_pdf_context(b"%PDF-1.7\nexample")

    assert result.page_count == 2
    assert result.was_truncated is False
    assert result.text == "[page 1]\nalpha\n\n[page 2]\nbeta"


@pytest.mark.parametrize(
    ("payload", "expected_status", "expected_detail"),
    [
        (b"not a pdf", 422, "Choose a valid text-based PDF."),
        (
            b"%PDF-1.7\n" + b"x" * (10 * 1024 * 1024 + 1),
            413,
            "This PDF is larger than 10 MB.",
        ),
    ],
)
def test_extract_pdf_context_rejects_invalid_or_oversized_payloads(
    payload, expected_status, expected_detail
):
    with pytest.raises(pdf_context.PdfContextError) as raised:
        pdf_context.extract_pdf_context(payload)

    assert raised.value.status_code == expected_status
    assert raised.value.detail == expected_detail


def test_extract_pdf_context_rejects_encrypted_and_textless_documents(monkeypatch):
    monkeypatch.setattr(
        pdf_context, "PdfReader", lambda _stream: _reader("notes", encrypted=True)
    )
    with pytest.raises(pdf_context.PdfContextError, match="unlocked"):
        pdf_context.extract_pdf_context(b"%PDF-1.7\nexample")

    monkeypatch.setattr(
        pdf_context, "PdfReader", lambda _stream: _reader("", "   ")
    )
    with pytest.raises(pdf_context.PdfContextError, match="no selectable text"):
        pdf_context.extract_pdf_context(b"%PDF-1.7\nexample")


def test_extract_pdf_context_bounds_long_documents_across_pages(monkeypatch):
    long_pages = [f"page-{index}-" + ("x" * 1_000) for index in range(1, 51)]
    monkeypatch.setattr(
        pdf_context, "PdfReader", lambda _stream: _reader(*long_pages)
    )
    monkeypatch.setattr(pdf_context, "MAX_SOURCE_CONTEXT_CHARS", 1_500)

    result = pdf_context.extract_pdf_context(b"%PDF-1.7\nexample")

    assert result.page_count == 50
    assert result.was_truncated is True
    assert len(result.text) <= 1_500
    assert "[page 1]" in result.text
    assert "[page 25]" in result.text
    assert "[page 50]" in result.text


def test_extract_pdf_context_rejects_more_than_fifty_pages(monkeypatch):
    monkeypatch.setattr(
        pdf_context, "PdfReader", lambda _stream: _reader(*(["notes"] * 51))
    )

    with pytest.raises(pdf_context.PdfContextError, match="more than 50 pages"):
        pdf_context.extract_pdf_context(b"%PDF-1.7\nexample")
