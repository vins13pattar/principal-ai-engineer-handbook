from __future__ import annotations

from retrieval.chunking import chunk_document


def test_paragraphs_under_same_heading_merge_when_they_fit() -> None:
    doc = "# Intro\n\nFirst sentence.\n\nSecond sentence.\n"
    chunks = chunk_document("doc1", doc, max_chars=200)
    assert len(chunks) == 1
    assert "First sentence." in chunks[0].text
    assert "Second sentence." in chunks[0].text


def test_different_headings_never_share_a_chunk() -> None:
    doc = "# A\n\nParagraph under A.\n\n# B\n\nParagraph under B.\n"
    chunks = chunk_document("doc1", doc, max_chars=200)
    assert [c.heading for c in chunks] == ["A", "B"]
    assert "Paragraph under A." not in chunks[1].text
    assert "Paragraph under B." not in chunks[0].text


def test_exceeding_max_chars_starts_a_new_chunk_with_overlap() -> None:
    doc = "# Section\n\nShort one.\n\n" + ("word " * 40).strip() + "\n"
    chunks = chunk_document("doc1", doc, max_chars=40, overlap_chars=10)
    assert len(chunks) >= 2
    # the second chunk carries the tail of the first, so context isn't lost at the boundary
    assert chunks[1].text.startswith(chunks[0].text[-10:].strip()[:5])


def test_oversized_single_paragraph_splits_on_sentence_boundaries() -> None:
    sentence = "This is one sentence. "
    doc = "# Section\n\n" + sentence * 10 + "\n"
    chunks = chunk_document("doc1", doc, max_chars=60)
    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.text.strip().endswith(".")


def test_chunk_ids_are_sequential_per_document() -> None:
    doc = "# A\n\nOne.\n\n# B\n\nTwo.\n\n# C\n\nThree.\n"
    chunks = chunk_document("doc1", doc, max_chars=200)
    assert [c.id for c in chunks] == ["doc1#0", "doc1#1", "doc1#2"]
    assert [c.position for c in chunks] == [0, 1, 2]


def test_empty_document_produces_no_chunks() -> None:
    assert chunk_document("doc1", "") == []
    assert chunk_document("doc1", "\n\n   \n\n") == []


def test_text_without_headings_still_chunks() -> None:
    doc = "Just a plain paragraph with no heading at all."
    chunks = chunk_document("doc1", doc, max_chars=200)
    assert len(chunks) == 1
    assert chunks[0].heading is None
