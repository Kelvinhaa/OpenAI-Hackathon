from dataclasses import dataclass
from io import BytesIO

from pypdf import PdfReader
from pypdf.errors import PdfReadError


MAX_PDF_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 50
MAX_SOURCE_CONTEXT_CHARS = 30_000


@dataclass(frozen=True)
class PdfStudyContext:
    text: str
    page_count: int
    was_truncated: bool


class PdfContextError(ValueError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _page_block(page_number: int, text: str) -> str:
    return f"[page {page_number}]\n{text}"


def _build_page_aware_context(page_texts: list[tuple[int, str]]) -> tuple[str, bool]:
    complete_context = "\n\n".join(
        _page_block(page_number, text) for page_number, text in page_texts
    )
    if len(complete_context) <= MAX_SOURCE_CONTEXT_CHARS:
        return complete_context, False

    block_prefixes = [_page_block(page_number, "") for page_number, _ in page_texts]
    separator_length = 2 * (len(page_texts) - 1)
    structural_length = sum(len(prefix) for prefix in block_prefixes) + separator_length
    remaining_budget = MAX_SOURCE_CONTEXT_CHARS - structural_length
    if remaining_budget < len(page_texts):
        raise PdfContextError(422, "This PDF contains too many pages to summarize safely.")

    per_page_budget = remaining_budget // len(page_texts)
    excerpts: list[str] = []
    for page_number, text in page_texts:
        if len(text) > per_page_budget:
            excerpt = text[: per_page_budget - 1].rstrip() + "…"
        else:
            excerpt = text
        excerpts.append(_page_block(page_number, excerpt))

    return "\n\n".join(excerpts), True


def extract_pdf_context(payload: bytes) -> PdfStudyContext:
    if len(payload) > MAX_PDF_BYTES:
        raise PdfContextError(413, "This PDF is larger than 10 MB.")
    if not payload.startswith(b"%PDF-"):
        raise PdfContextError(422, "Choose a valid text-based PDF.")

    try:
        reader = PdfReader(BytesIO(payload))
    except (PdfReadError, ValueError, OSError) as exc:
        raise PdfContextError(422, "Choose a valid text-based PDF.") from exc

    if reader.is_encrypted:
        raise PdfContextError(422, "Choose an unlocked text-based PDF.")
    if len(reader.pages) > MAX_PDF_PAGES:
        raise PdfContextError(422, "This PDF has more than 50 pages.")

    page_texts: list[tuple[int, str]] = []
    try:
        for page_number, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if text:
                page_texts.append((page_number, text))
    except Exception as exc:
        raise PdfContextError(422, "Choose a valid text-based PDF.") from exc

    if not page_texts:
        raise PdfContextError(
            422,
            "This PDF has no selectable text; scanned PDFs are not supported yet.",
        )

    text, was_truncated = _build_page_aware_context(page_texts)
    return PdfStudyContext(
        text=text,
        page_count=len(reader.pages),
        was_truncated=was_truncated,
    )
