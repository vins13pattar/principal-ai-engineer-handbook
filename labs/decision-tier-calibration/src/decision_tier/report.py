"""Render the analysis of committed results. No model, no network: CI runs this."""

from __future__ import annotations

import json
from pathlib import Path

from decision_tier.metrics import (
    accuracy,
    apply_temperature,
    ece,
    fit_temperature,
    majority_baseline,
    random_baseline,
    reliability,
    split,
    typesafe_confidence,
)
from decision_tier.records import Record, read_jsonl
from decision_tier.threshold import fit_threshold, sweep

THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]
TARGET_ERROR = 0.10
SPLIT_SEED = 0


def _pct(x: float) -> str:
    return f"{100 * x:5.1f}%"


def _distinct_tops(records: list[Record]) -> int:
    return len({round(r.top, 4) for r in records})


def _section(name: str, records: list[Record], info: dict[str, object]) -> list[str]:
    out: list[str] = []
    add = out.append
    options = records[0].options
    add(f"== {name}  ({info.get('question_type')}, {options} options, {len(records)} records)")
    add(f"   source: {info.get('hub_id')} [{info.get('split')}], {info.get('license')}")
    add(f"   truncated by the model: {sum(r.truncated for r in records)}")
    add(f"   distinct top-probability values: {_distinct_tops(records)}")
    add("")
    add(f"   accuracy            {_pct(accuracy(records))}")
    add(f"   majority baseline   {_pct(majority_baseline(records))}")
    add(f"   random baseline     {_pct(random_baseline(records))}")
    add("")

    fit, held_out = split(records, seed=SPLIT_SEED)
    temperature = fit_temperature(fit)
    scaled_fit = apply_temperature(fit, temperature)
    scaled_held_out = apply_temperature(held_out, temperature)
    add(f"   calibration on the held-out half ({len(held_out)}; fitted on {len(fit)})")
    add(f"     ECE as shipped               {ece(held_out):.3f}")
    add(f"     temperature fitted           {temperature:.2f}")
    add(f"     ECE after temperature        {ece(scaled_held_out):.3f}")
    add("")

    add("   reliability as shipped, all records: stated confidence vs actual accuracy")
    for row in reliability(records, bins=5):
        if row.count:
            add(
                f"     {row.low:.1f}-{row.high:.1f}   n={row.count:<4}"
                f" stated {_pct(row.confidence)}   right {_pct(row.accuracy)}"
            )
    add("")

    add("   threshold on top probability, held-out half")
    add("     threshold   shipped: keeps  right   |  after temperature: keeps  right")
    shipped = sweep(held_out, THRESHOLDS)
    scaled = sweep(scaled_held_out, THRESHOLDS)
    for a, b in zip(shipped, scaled, strict=True):
        a_acc = _pct(a.accuracy) if a.kept else "   -  "
        b_acc = _pct(b.accuracy) if b.kept else "   -  "
        add(
            f"     {a.threshold:>9.2f}   {_pct(a.coverage)} {a_acc}   |  {_pct(b.coverage)} {b_acc}"
        )
    add("")

    add(f"   a threshold fitted for {_pct(TARGET_ERROR).strip()} error on the fit half,")
    add("   then used on the held-out half")
    for label, fit_side, test_side in (
        ("shipped", fit, held_out),
        ("after temperature", scaled_fit, scaled_held_out),
    ):
        threshold = fit_threshold(fit_side, TARGET_ERROR)
        if threshold is None:
            add(f"     {label:<18} no threshold reaches it with 30 or more answers kept")
            continue
        point = sweep(test_side, [threshold])[0]
        error = 1 - point.accuracy if point.kept else float("nan")
        add(
            f"     {label:<18} threshold {threshold:.4f}: keeps {_pct(point.coverage)},"
            f" error {_pct(error)}"
        )
    if options > 2:
        equivalent = typesafe_confidence((0.9,) + ((0.1 / (options - 1)),) * (options - 1))
        add("")
        add(
            f"   top probability 0.90 is TypeSafe-style confidence {equivalent:.3f}"
            f" at {options} options"
        )
    add("")
    return out


def render(results_dir: Path) -> str:
    meta = json.loads((results_dir / "meta.json").read_text())
    lines = [
        f"Laya {meta['laya_version']} @ {meta['revision'][:12]}, {meta['device']},"
        f" measured {meta['measured_on']}",
        "",
    ]
    for name, info in meta["sets"].items():
        records = read_jsonl(results_dir / f"{name}.jsonl")
        lines.extend(_section(name, records, info))
    return "\n".join(lines)
