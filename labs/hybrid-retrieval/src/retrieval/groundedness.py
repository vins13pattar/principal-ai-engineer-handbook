from __future__ import annotations

import re
from dataclasses import dataclass

_CITATION_RE = re.compile(r"\[([\w\-#]+)\]")


def extract_citations(answer: str) -> frozenset[str]:
    return frozenset(_CITATION_RE.findall(answer))


@dataclass(frozen=True, slots=True)
class GroundednessReport:
    cited_chunk_ids: frozenset[str]
    ungrounded_chunk_ids: frozenset[str]

    @property
    def is_fully_grounded(self) -> bool:
        return not self.ungrounded_chunk_ids


def check_groundedness(answer: str, retrieved_chunk_ids: frozenset[str]) -> GroundednessReport:
    """Verify every citation in a generated answer points at a chunk that was actually retrieved.

    This does not check whether the cited passage actually supports the
    claim next to it — that needs a model or a human. What it catches
    cheaply and reliably is the cruder failure: a citation pointing at a
    chunk ID that was never in the retrieved context at all, which means
    the model fabricated the reference outright.
    """
    cited = extract_citations(answer)
    ungrounded = cited - retrieved_chunk_ids
    return GroundednessReport(cited_chunk_ids=cited, ungrounded_chunk_ids=ungrounded)
