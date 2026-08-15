"""Semantic caching, and a measurement of what the similarity threshold costs.

The lab's claim lives in `tests/test_threshold.py`: a threshold loose enough to catch
real paraphrases is also loose enough to conflate questions with different answers,
and the gap between those two is the thing to measure before shipping a cache.
"""

from semantic_cache.cache import Entry, HitKind, Lookup, Scope, SemanticCache
from semantic_cache.evaluation import ThresholdResult, evaluate, sweep

__all__ = [
    "Entry",
    "HitKind",
    "Lookup",
    "Scope",
    "SemanticCache",
    "ThresholdResult",
    "evaluate",
    "sweep",
]
