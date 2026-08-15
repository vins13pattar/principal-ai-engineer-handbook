"""A deterministic stand-in for actually calling a model.

DELIBERATELY SIMULATED. No model is called. `SimulatedModel` decides correctness from
a seeded hash of (model, task), so a run is reproducible and the measurement in
`workload.py` is a property of the routing policy rather than of sampling noise.

What it models faithfully is the only thing the escalation argument depends on: that a
model has some per-task-class accuracy, and emits a confidence signal whose usefulness
is a separate question from its accuracy. Those two being independent is the whole
point — see `ConfidenceSignal`.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from enum import StrEnum

from model_router.models import ModelSpec, Task


def _unit_hash(*parts: str) -> float:
    """A stable float in [0, 1) from the given parts. Same inputs, same value, always."""
    digest = hashlib.sha256("|".join(parts).encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


class ConfidenceSignal(StrEnum):
    """How much a model's self-reported confidence actually tells you.

    The distinction the lab exists to measure. Escalation policies are built on the
    assumption that low confidence predicts wrong answers. When that assumption holds
    the policy is excellent; when it does not, the policy pays for two calls to get
    one model's accuracy.
    """

    #: Confidence tracks correctness — low exactly when the answer is wrong.
    INFORMATIVE = "informative"
    #: Confidence is unrelated to correctness. Plausible, common, and rarely checked.
    UNINFORMATIVE = "uninformative"


@dataclass(frozen=True)
class Attempt:
    """What came back from one (simulated) model call."""

    model: str
    correct: bool
    confidence: float
    cost: float


@dataclass(frozen=True)
class SimulatedModel:
    """Runs a task against a spec's declared quality, deterministically."""

    signal: ConfidenceSignal = ConfidenceSignal.INFORMATIVE

    def run(self, task: Task, model: ModelSpec) -> Attempt:
        accuracy = model.quality_for(task.task_class)
        roll = _unit_hash(model.name, task.task_id, "correctness")
        correct = roll < accuracy

        if self.signal is ConfidenceSignal.INFORMATIVE:
            # Confidence lands below the usual 0.5 escalation threshold precisely when
            # the answer is wrong, which is the best case any escalation policy can hope
            # for and therefore the fairest one to measure it under.
            confidence = 0.9 if correct else 0.2
        else:
            # Independent of correctness: a plausible-looking number that carries no
            # information. Nothing about the API surface distinguishes this case, which
            # is why it has to be measured rather than assumed.
            confidence = _unit_hash(model.name, task.task_id, "confidence")

        return Attempt(
            model=model.name,
            correct=correct,
            confidence=confidence,
            cost=task.cost_on(model),
        )
