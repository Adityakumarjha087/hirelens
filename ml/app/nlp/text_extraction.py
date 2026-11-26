"""Convert uploaded resume files (PDF, DOCX, TXT) to plain text."""

from __future__ import annotations

import io
import re
import zipfile

from docx import Document
from pypdf import PdfReader
from pypdf.errors import PdfReadError

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TEXT_MIME = "text/plain"
SUPPORTED_MIME_TYPES = frozenset({PDF_MIME, DOCX_MIME, TEXT_MIME})


class UnsupportedFileError(ValueError):
    """Raised when a file cannot be converted to text."""


def detect_mime(filename: str, declared: str | None, head: bytes) -> str:
    """Sniff the real type from magic bytes; never trust the client-declared type alone."""
    if head.startswith(b"%PDF"):
        return PDF_MIME
    if head.startswith(b"PK\x03\x04") and filename.lower().endswith(".docx"):
        return DOCX_MIME
    if filename.lower().endswith(".txt") or declared == TEXT_MIME:
        try:
            head.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise UnsupportedFileError("Text file is not valid UTF-8") from exc
        return TEXT_MIME
    raise UnsupportedFileError("Unsupported file type; upload a PDF, DOCX or TXT resume")


def _clean(text: str) -> str:
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(line.strip() for line in text.split("\n")).strip()


def extract_text(data: bytes, mime: str) -> str:
    try:
        if mime == PDF_MIME:
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif mime == DOCX_MIME:
            doc = Document(io.BytesIO(data))
            parts = [p.text for p in doc.paragraphs]
            for table in doc.tables:
                for row in table.rows:
                    parts.append(" | ".join(cell.text for cell in row.cells))
            text = "\n".join(parts)
        elif mime == TEXT_MIME:
            text = data.decode("utf-8")
        else:  # pragma: no cover - guarded by detect_mime
            raise UnsupportedFileError(f"Unsupported mime type {mime}")
    except (PdfReadError, KeyError, ValueError, zipfile.BadZipFile, OSError) as exc:
        if isinstance(exc, UnsupportedFileError):
            raise
        raise UnsupportedFileError(f"Could not read file: {exc}") from exc
    cleaned = _clean(text)
    if len(cleaned) < 20:
        raise UnsupportedFileError("No extractable text found (scanned PDFs are not supported)")
    return cleaned
