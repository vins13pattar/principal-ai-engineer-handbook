"""The workload: paraphrases that share an answer, and near-duplicates that do not.

The second group is the whole point. Every semantic cache demo uses the first group
and reports a wonderful hit rate. The questions that get a cache into trouble are the
ones that look almost identical and mean something materially different — a different
region, a different year, a different plan tier.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Question:
    """One query, and the answer that is actually correct for it."""

    text: str
    correct_answer: str


#: Genuinely equivalent phrasings. A cache SHOULD serve these from one entry.
PARAPHRASES: tuple[tuple[Question, Question], ...] = (
    (
        Question("How do I reset my password?", "password-reset"),
        Question("How can I reset my password?", "password-reset"),
    ),
    (
        Question("What is your refund policy?", "refund-policy-general"),
        Question("What's the refund policy?", "refund-policy-general"),
    ),
    (
        Question("How do I cancel my subscription?", "cancel-subscription"),
        Question("How can I cancel a subscription?", "cancel-subscription"),
    ),
    (
        Question("Where do I download the invoice?", "invoice-download"),
        Question("Where can I download my invoice?", "invoice-download"),
    ),
)

#: Near-identical surface form, different correct answer. A cache MUST NOT conflate
#: these, and a similarity threshold loose enough to catch the paraphrases above will.
NEAR_DUPLICATES: tuple[tuple[Question, Question], ...] = (
    (
        Question("What is the refund policy for EU customers?", "refund-eu"),
        Question("What is the refund policy for US customers?", "refund-us"),
    ),
    (
        Question("What were the support hours in 2025?", "hours-2025"),
        Question("What were the support hours in 2026?", "hours-2026"),
    ),
    (
        Question("How many seats are included in the Pro plan?", "seats-pro"),
        Question("How many seats are included in the Team plan?", "seats-team"),
    ),
    (
        Question("Is data encrypted at rest?", "encryption-at-rest"),
        Question("Is data encrypted in transit?", "encryption-in-transit"),
    ),
    (
        Question("What is the rate limit for the free tier?", "ratelimit-free"),
        Question("What is the rate limit for the paid tier?", "ratelimit-paid"),
    ),
)
