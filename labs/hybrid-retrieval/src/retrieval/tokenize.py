from __future__ import annotations

import re

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Lowercase, alphanumeric-only tokenization shared by lexical scoring and embeddings.

    Both retrieval signals need to agree on what a "term" is; a query and a
    chunk tokenized differently would silently break matching.
    """
    return _TOKEN_RE.findall(text.lower())
