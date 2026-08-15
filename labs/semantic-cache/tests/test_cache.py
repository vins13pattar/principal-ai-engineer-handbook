"""Cache mechanics: the exact tier, the scope key, and expiry.

Everything here is about the parts that must be correct regardless of what the
similarity threshold is set to.
"""

from __future__ import annotations

from semantic_cache.cache import HitKind, Scope, SemanticCache

SCOPE = Scope(tenant="acme", model="m-1", prompt_version="p-1")
Q = "What is the refund policy for EU customers?"


def test_an_exact_repeat_hits_the_exact_tier_at_any_threshold() -> None:
    """The always-correct half of the cache, and it must not depend on tuning."""
    for threshold in (0.5, 0.95, 0.99, 1.0):
        cache = SemanticCache(threshold=threshold)
        cache.put(Q, "refund-eu", SCOPE, now=0.0)

        result = cache.get(Q, SCOPE, now=1.0)

        assert result.kind is HitKind.EXACT
        assert result.answer == "refund-eu"


def test_a_different_tenant_never_sees_another_tenants_answer() -> None:
    """Scope is part of the key, not a filter applied to results.

    Filtering after the similarity search means the neighbour was already read out of
    another tenant's data — the same mistake the Vector DB lookup opens with.
    """
    cache = SemanticCache(threshold=0.5)  # deliberately loose
    cache.put(Q, "refund-eu", SCOPE, now=0.0)

    other = Scope(tenant="globex", model="m-1", prompt_version="p-1")
    assert cache.get(Q, other, now=1.0).kind is HitKind.MISS


def test_changing_the_model_invalidates_the_entry() -> None:
    """A cached answer is an answer *from a particular model*.

    Serve it after a model change and you are reporting the old model's behaviour as
    the new one's — which also destroys any evaluation running downstream.
    """
    cache = SemanticCache(threshold=0.5)
    cache.put(Q, "refund-eu", SCOPE, now=0.0)

    upgraded = Scope(tenant="acme", model="m-2", prompt_version="p-1")
    assert cache.get(Q, upgraded, now=1.0).kind is HitKind.MISS


def test_changing_the_prompt_version_invalidates_the_entry() -> None:
    """The most commonly forgotten key component.

    Prompts get edited far more often than models change, and an edit that alters the
    answer's format or content silently keeps serving the old shape until the TTL runs.
    """
    cache = SemanticCache(threshold=0.5)
    cache.put(Q, "refund-eu", SCOPE, now=0.0)

    revised = Scope(tenant="acme", model="m-1", prompt_version="p-2")
    assert cache.get(Q, revised, now=1.0).kind is HitKind.MISS


def test_entries_expire_at_the_ttl() -> None:
    cache = SemanticCache(threshold=0.5, ttl_seconds=60.0)
    cache.put(Q, "refund-eu", SCOPE, now=0.0)

    assert cache.get(Q, SCOPE, now=59.0).kind is HitKind.EXACT
    assert cache.get(Q, SCOPE, now=60.0).kind is HitKind.MISS


def test_an_expired_entry_is_not_reachable_through_the_semantic_tier_either() -> None:
    """Guards a real gap: expiring the exact key but leaving the vector searchable."""
    cache = SemanticCache(threshold=0.5, ttl_seconds=60.0)
    cache.put(Q, "refund-eu", SCOPE, now=0.0)

    nearby = "What is the refund policy for US customers?"
    assert cache.get(nearby, SCOPE, now=61.0).kind is HitKind.MISS


def test_a_miss_still_reports_the_best_similarity_it_saw() -> None:
    """So a threshold can be tuned from observed traffic rather than from a blog post."""
    cache = SemanticCache(threshold=0.99)
    cache.put(Q, "refund-eu", SCOPE, now=0.0)

    result = cache.get("What is the refund policy for US customers?", SCOPE, now=1.0)

    assert result.kind is HitKind.MISS
    assert result.similarity is not None and 0.0 < result.similarity < 0.99


def test_an_empty_cache_misses_without_raising() -> None:
    assert SemanticCache().get(Q, SCOPE, now=0.0).kind is HitKind.MISS


def test_a_semantic_hit_reports_which_question_it_matched() -> None:
    """Without this a false hit is untraceable after the fact."""
    cache = SemanticCache(threshold=0.80)
    cache.put(Q, "refund-eu", SCOPE, now=0.0)

    result = cache.get("What is the refund policy for US customers?", SCOPE, now=1.0)

    assert result.kind is HitKind.SEMANTIC
    assert result.matched_question == Q
    assert result.answer == "refund-eu", "the wrong answer, served confidently"
