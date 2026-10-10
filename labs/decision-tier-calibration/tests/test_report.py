"""The report reproduces from committed numbers alone."""

import json
from pathlib import Path

from synthetic import make_records

from decision_tier.cli import RESULTS
from decision_tier.records import read_jsonl, write_jsonl
from decision_tier.report import render


def _results(tmp_path: Path) -> Path:
    write_jsonl(make_records(400, options=3, overconfidence=2.0), tmp_path / "synthetic.jsonl")
    meta = {
        "laya_version": "test",
        "revision": "0123456789abcdef",
        "device": "cpu",
        "measured_on": "2026-01-01",
        "sets": {
            "synthetic": {
                "hub_id": "none",
                "split": "test",
                "license": "n/a",
                "question_type": "choice",
            }
        },
    }
    (tmp_path / "meta.json").write_text(json.dumps(meta))
    return tmp_path


def test_the_report_is_deterministic(tmp_path: Path) -> None:
    results = _results(tmp_path)
    assert render(results) == render(results)


def test_the_report_states_baselines_and_held_out_calibration(tmp_path: Path) -> None:
    text = render(_results(tmp_path))
    for needle in ("majority baseline", "ECE as shipped", "held-out half", "fitted on"):
        assert needle in text


def test_committed_results_match_their_metadata() -> None:
    """Guards the committed evidence: every set named in meta.json is there, whole."""
    meta = json.loads((RESULTS / "meta.json").read_text())
    for name, info in meta["sets"].items():
        records = read_jsonl(RESULTS / f"{name}.jsonl")
        assert len(records) == info["sampled"]
        assert {r.options for r in records} == {info["options"]}
        # Laya reports probabilities to four decimals, so each option can be off by
        # up to 0.00005 and the sum by that much per option: 77 options can drift
        # by ~0.004 without anything being wrong.
        assert all(abs(sum(r.probs) - 1) <= 1e-4 * r.options for r in records)
        assert all(0 <= r.label < r.options for r in records)


def test_committed_results_render() -> None:
    assert "accuracy" in render(RESULTS)
