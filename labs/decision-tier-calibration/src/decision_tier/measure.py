"""Run Laya over human-labelled data and write the records this lab analyses.

The one part of the lab that needs torch, the ~800 MB checkpoint, and the
network, so it is never run in CI. Install with ``pip install -e '.[measure]'``
and run ``decision-tier measure``; it writes ``results/<set>.jsonl`` and
``results/meta.json``, which are committed and are what everything else reads.

Only numbers are written: the row index into the public dataset, the human
label, and the model's probabilities. The text stays on the Hub.
"""

from __future__ import annotations

import json
import platform
import random
import statistics
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from decision_tier.records import Record, write_jsonl

SAMPLE = 1000
SEED = 20261010


@dataclass(frozen=True)
class DecisionSet:
    """A public dataset recast as one typed question per row."""

    name: str
    hub_id: str
    split: str
    license: str
    question: dict[str, Any]
    # Maps a dataset row to (state, label index).
    row_to_case: Callable[[dict[str, Any]], tuple[str, int]]
    # Option names in label-index order; None for a noul question.
    options: list[str] | None


def _twitter() -> DecisionSet:
    options = ["bearish", "bullish", "neutral"]  # the dataset's label order
    return DecisionSet(
        name="twitter-financial-sentiment",
        hub_id="zeroshot/twitter-financial-news-sentiment",
        split="validation",
        license="MIT",
        question={
            "type": "choice",
            "instructions": "What is the market sentiment of this financial news tweet?",
            "criteria": {
                "bearish": "Negative for the company, stock, or market",
                "bullish": "Positive for the company, stock, or market",
                "neutral": "Neither positive nor negative",
            },
        },
        row_to_case=lambda row: (str(row["text"]), int(row["label"])),
        options=options,
    )


def _amazon_review(row: dict[str, Any]) -> tuple[str, int]:
    return f"{row['title']}\n\n{row['content']}", int(row["label"])


def _amazon() -> list[DecisionSet]:
    """One decision -- is this review positive? -- asked three ways, on the same rows.

    Probing the first phrasing found Laya answering "no" to an obviously
    positive review, and "yes" once the question was reworded. The same
    decision as a two-option choice behaved. Measuring all three on identical
    rows separates the model's judgement from its sensitivity to the question.
    """
    common: dict[str, Any] = {
        "hub_id": "fancyzhx/amazon_polarity",
        "split": "test",
        "license": "Apache-2.0",
        "row_to_case": _amazon_review,
    }
    return [
        DecisionSet(
            name="amazon-noul-is-positive",
            question={"type": "noul", "instructions": "Is this product review positive?"},
            options=None,
            **common,
        ),
        DecisionSet(
            name="amazon-noul-likes-product",
            question={"type": "noul", "instructions": "Does the reviewer like the product?"},
            options=None,
            **common,
        ),
        DecisionSet(
            name="amazon-choice",
            question={
                "type": "choice",
                "instructions": "What is the sentiment of this product review?",
                "criteria": {
                    "negative": "The reviewer is dissatisfied",
                    "positive": "The reviewer is satisfied",
                },
            },
            options=["negative", "positive"],  # the dataset's label order
            **common,
        ),
    ]


def _banking77(names: list[str]) -> DecisionSet:
    readable = [n.replace("_", " ") for n in names]
    return DecisionSet(
        name="banking77",
        # The official PolyAI/banking77 repo still ships a loading script, which
        # current `datasets` refuses; this is the Hub's maintained copy, same
        # data, same CC-BY-4.0 license.
        hub_id="legacy-datasets/banking77",
        split="test",
        license="CC-BY-4.0",
        question={
            "type": "choice",
            "instructions": "Which banking support intent does this customer message express?",
            "criteria": {r: r for r in readable},
        },
        row_to_case=lambda row: (str(row["text"]), int(row["label"])),
        options=readable,
    )


def _probs(answer: dict[str, Any], options: list[str] | None) -> tuple[float, ...]:
    if options is None:
        p = float(answer["noul"])
        return (1.0 - p, p)
    by_name = answer["probabilities"]
    return tuple(float(by_name[o]) for o in options)


def measure(results_dir: Path, sample: int = SAMPLE) -> None:
    import laya
    from datasets import load_dataset

    revision = laya.PINNED_REVISIONS["convaiinnovations/laya"]
    agent = laya.load("convaiinnovations/laya", revision=revision)

    banking = load_dataset("legacy-datasets/banking77", split="test")
    sets = [_twitter(), *_amazon(), _banking77(list(banking.features["label"].names))]

    meta: dict[str, Any] = {
        "model": "convaiinnovations/laya",
        "laya_version": laya.__version__ if hasattr(laya, "__version__") else "0.4.1",
        "revision": revision,
        "device": str(getattr(agent, "device", "unknown")),
        "platform": f"{platform.system()} {platform.machine()}",
        "measured_on": datetime.now(UTC).strftime("%Y-%m-%d"),
        "seed": SEED,
        "sets": {},
    }
    results_dir.mkdir(parents=True, exist_ok=True)
    for stale in results_dir.glob("*.jsonl"):
        stale.unlink()
    loaded: dict[str, Any] = {"legacy-datasets/banking77": banking}

    for spec in sets:
        if spec.hub_id not in loaded:
            loaded[spec.hub_id] = load_dataset(spec.hub_id, split=spec.split)
        data = loaded[spec.hub_id]
        # Seeded by dataset, not by question, so every way of asking about the
        # same dataset is asked about the same rows.
        rows = sorted(random.Random(f"{SEED}:{spec.hub_id}").sample(range(len(data)), sample))
        records: list[Record] = []
        latencies: list[float] = []
        for i in rows:
            state, label = spec.row_to_case(data[i])
            start = time.perf_counter()
            result = agent.predict(state, {"q": spec.question})
            latencies.append((time.perf_counter() - start) * 1000)
            usage = result.get("usage") or {}
            records.append(
                Record(
                    dataset=spec.name,
                    row=i,
                    label=label,
                    probs=_probs(result["answers"]["q"], spec.options),
                    truncated=bool(usage.get("truncated") or usage.get("truncated_questions")),
                )
            )
        write_jsonl(records, results_dir / f"{spec.name}.jsonl")
        # The first call pays for warm-up, so latency is summarised without it.
        warm = latencies[1:]
        meta["sets"][spec.name] = {
            "hub_id": spec.hub_id,
            "split": spec.split,
            "license": spec.license,
            "rows_in_split": len(data),
            "sampled": len(records),
            "options": 2 if spec.options is None else len(spec.options),
            "question_type": spec.question["type"],
            "latency_ms_p50": round(statistics.median(warm), 1),
            "latency_ms_p95": round(sorted(warm)[int(0.95 * (len(warm) - 1))], 1),
        }
        p50 = meta["sets"][spec.name]["latency_ms_p50"]
        print(f"{spec.name}: {len(records)} records, p50 {p50} ms")

    (results_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
