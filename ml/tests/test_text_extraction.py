from __future__ import annotations

import io

import pytest
from docx import Document
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.nlp.text_extraction import (
    DOCX_MIME,
    PDF_MIME,
    TEXT_MIME,
    UnsupportedFileError,
    detect_mime,
    extract_text,
)


def make_pdf(lines: list[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 750
    for line in lines:
        c.drawString(72, y, line)
        y -= 16
    c.save()
    return buf.getvalue()


def make_docx(lines: list[str]) -> bytes:
    doc = Document()
    for line in lines:
        doc.add_paragraph(line)
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Python"
    table.rows[0].cells[1].text = "Docker"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


LINES = [
    "Alex Kim",
    "alex@example.com",
    "SKILLS",
    "Python, React, AWS",
    "EXPERIENCE",
    "Engineer at Initech (2019 - 2023)",
]


def test_pdf_roundtrip() -> None:
    data = make_pdf(LINES)
    assert detect_mime("cv.pdf", "application/octet-stream", data[:10]) == PDF_MIME
    text = extract_text(data, PDF_MIME)
    assert "Alex Kim" in text and "Python, React, AWS" in text


def test_docx_roundtrip() -> None:
    data = make_docx(LINES)
    assert detect_mime("cv.docx", None, data[:10]) == DOCX_MIME
    text = extract_text(data, DOCX_MIME)
    assert "Initech" in text and "Python | Docker" in text


def test_txt_and_rejections() -> None:
    assert detect_mime("cv.txt", None, b"hello") == TEXT_MIME
    assert "Alex" in extract_text("\n".join(LINES).encode(), TEXT_MIME)
    with pytest.raises(UnsupportedFileError):
        detect_mime("image.png", "image/png", b"\x89PNG")
    with pytest.raises(UnsupportedFileError):
        detect_mime("cv.txt", "text/plain", b"\xff\xfe\xfa")
    with pytest.raises(UnsupportedFileError):
        extract_text(b"short", TEXT_MIME)
    with pytest.raises(UnsupportedFileError):
        extract_text(b"%PDF-1.4 garbage", PDF_MIME)
