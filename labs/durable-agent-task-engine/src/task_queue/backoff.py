from __future__ import annotations

import random


def exponential_backoff_seconds(
    attempt: int,
    *,
    base_seconds: float = 1.0,
    max_seconds: float = 60.0,
    jitter_ratio: float = 0.2,
) -> float:
    """Full-jitter exponential backoff for the given (1-indexed) attempt.

    Jitter avoids synchronized retry storms across many tasks that failed
    at the same time (e.g. a downstream dependency blip).
    """
    if attempt < 1:
        raise ValueError("attempt must be >= 1")
    capped = min(max_seconds, base_seconds * (2.0 ** (attempt - 1)))
    jitter = capped * jitter_ratio
    return float(capped - jitter + random.random() * (2 * jitter))
