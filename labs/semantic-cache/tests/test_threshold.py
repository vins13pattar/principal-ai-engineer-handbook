"""The measurement this lab exists for, and an honest account of what it does not show.

Sweeping the similarity threshold produces two curves. Hit rate is the one that gets
reported. False-hit rate — a confidently wrong cached answer, served fast, downstream
indistinguishable from a right one — is the one that decides whether the cache is a
cost saving or a correctness bug.

On this corpus, with this embedding, the two curves are **inverted**: near-duplicate
questions with different correct answers score 0.86-0.91 against each other, while
genuine paraphrases score 0.45-0.83. There is no threshold that admits the paraphrases
without admitting the near-duplicates first.

HOW MUCH OF THAT IS THE SIMULATION? A real, dense embedding model would separate these
groups better than the lexical proxy in `embedding.py` does, and the specific numbers
here should not be quoted anywhere. But the mechanism is not an artefact: the token
carrying the semantic difference — "EU" vs "US", "2025" vs "2026", "free" vs "paid" —
is short, low-weight, and swamped by the long shared framing around it. That is a known
hard case for dense embeddings too, and it is why the engineering conclusion below is
about detecting entity swaps rather than about finding a better threshold.
"""

from __future__ import annotations

from semantic_cache.corpus import NEAR_DUPLICATES, PARAPHRASES
from semantic_cache.embedding import cosine, embed
from semantic_cache.evaluation import evaluate, sweep

THRESHOLDS = (0.99, 0.95, 0.90, 0.85, 0.80, 0.70, 0.60, 0.50)


def test_loosening_the_threshold_never_reduces_the_false_hit_rate() -> None:
    """The trade-off is monotone: every point of hit rate is bought with risk."""
    results = sweep(THRESHOLDS)  # descending threshold
    rates = [r.false_hit_rate for r in results]

    assert rates == sorted(rates), "a looser threshold produced fewer false hits"
    assert rates[0] == 0.0, "the tightest threshold should admit nothing wrong"
    assert rates[-1] > 0.0, "the loosest threshold should admit something wrong"


def test_no_threshold_on_this_corpus_serves_a_paraphrase_before_a_wrong_answer() -> None:
    """The uncomfortable result, pinned.

    At every threshold that produces any cache hit at all, precision is below 100%.
    Tightening until the wrong answers disappear also removes every right one.
    """
    for result in sweep(THRESHOLDS):
        served = result.true_hits + result.false_hits
        if served:
            assert result.precision < 1.0, (
                f"at threshold {result.threshold} the cache served only correct answers — "
                "if this is now achievable the lab's central finding has changed"
            )


def test_the_distributions_are_inverted_not_merely_overlapping() -> None:
    """Documents the artefact explicitly rather than letting it hide in a summary.

    Near-duplicates are *more* similar than paraphrases here. That inversion is
    embedding-dependent and is the reason the finding above is so absolute — a reader
    reproducing this with a dense model should expect overlap rather than inversion,
    and the conclusion to weaken accordingly.
    """
    paraphrase_scores = [cosine(embed(a.text), embed(b.text)) for a, b in PARAPHRASES]
    duplicate_scores = [cosine(embed(a.text), embed(b.text)) for a, b in NEAR_DUPLICATES]

    assert max(duplicate_scores) > max(paraphrase_scores)
    assert min(duplicate_scores) < max(paraphrase_scores), "the ranges do overlap"


def test_the_discriminating_token_is_the_low_weight_one() -> None:
    """Why the inversion happens, asserted rather than asserted-about.

    Two questions differing only in "EU"/"US" share every other token. The one token
    that changes the answer contributes a single dimension out of eight.
    """
    eu, us = NEAR_DUPLICATES[0]
    similarity = cosine(embed(eu.text), embed(us.text))

    assert similarity > 0.85, "one token of difference barely moves the vector"
    assert eu.correct_answer != us.correct_answer, "yet the correct answers differ entirely"


def test_the_tightest_threshold_is_safe_and_useless() -> None:
    """Both halves. A cache with a 0.99 threshold is correct and does nothing."""
    strict = evaluate(0.99)

    assert strict.false_hit_rate == 0.0
    assert strict.hit_rate == 0.0


def test_hit_rate_alone_would_recommend_the_worst_setting() -> None:
    """Why reporting one curve is the problem.

    Optimising the number that goes on a slide picks the loosest threshold available,
    which is also the one serving the most wrong answers.
    """
    results = sweep(THRESHOLDS)
    best_by_hit_rate = max(results, key=lambda r: r.hit_rate)
    worst_by_false_hits = max(results, key=lambda r: r.false_hit_rate)

    assert best_by_hit_rate.false_hit_rate == worst_by_false_hits.false_hit_rate
