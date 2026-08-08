from __future__ import annotations

import re

from .models import Chunk

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _parse_blocks(text: str) -> list[tuple[str | None, str]]:
    """Split text into (current heading, paragraph) pairs, in document order."""
    heading: str | None = None
    blocks: list[tuple[str | None, str]] = []
    paragraph_lines: list[str] = []

    def flush() -> None:
        if paragraph_lines:
            paragraph = " ".join(line.strip() for line in paragraph_lines).strip()
            if paragraph:
                blocks.append((heading, paragraph))
            paragraph_lines.clear()

    for line in text.splitlines():
        heading_match = _HEADING_RE.match(line)
        if heading_match:
            flush()
            heading = heading_match.group(2).strip()
            continue
        if not line.strip():
            flush()
            continue
        paragraph_lines.append(line)
    flush()
    return blocks


def _split_long_paragraph(paragraph: str, max_chars: int) -> list[str]:
    sentences = _SENTENCE_SPLIT_RE.split(paragraph)
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) > max_chars and current:
            pieces.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        pieces.append(current)
    return pieces


def chunk_document(
    document_id: str,
    text: str,
    *,
    max_chars: int = 800,
    overlap_chars: int = 100,
) -> list[Chunk]:
    """Group a document's paragraphs into chunks, respecting section boundaries.

    A paragraph is never split across chunks unless it alone exceeds
    ``max_chars``, in which case it is split on sentence boundaries. Each
    chunk that continues a section (rather than starting one) carries the
    tail of the previous chunk, so a reader — or a retriever — does not
    lose context right at the boundary.
    """
    blocks = _parse_blocks(text)

    chunks: list[Chunk] = []
    position = 0
    current_heading: str | None = None
    current_text = ""

    def flush() -> None:
        nonlocal current_text, position
        stripped = current_text.strip()
        if stripped:
            chunks.append(
                Chunk(
                    id=f"{document_id}#{position}",
                    document_id=document_id,
                    heading=current_heading,
                    text=stripped,
                    position=position,
                )
            )
            position += 1
        current_text = ""

    for heading, paragraph in blocks:
        if heading != current_heading and current_text:
            flush()
        current_heading = heading

        pieces = (
            _split_long_paragraph(paragraph, max_chars)
            if len(paragraph) > max_chars
            else [paragraph]
        )
        for piece in pieces:
            candidate = f"{current_text} {piece}".strip() if current_text else piece
            if len(candidate) > max_chars and current_text:
                closing_text = current_text
                flush()
                overlap = closing_text[-overlap_chars:] if overlap_chars else ""
                current_text = f"{overlap} {piece}".strip() if overlap else piece
            else:
                current_text = candidate

    flush()
    return chunks
