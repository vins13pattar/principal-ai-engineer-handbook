"""``decision-tier report`` (CI, no model) and ``decision-tier measure`` (local, needs Laya)."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

RESULTS = Path(__file__).resolve().parents[2] / "results"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="decision-tier")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("report", help="analyse the committed results")
    measure = sub.add_parser("measure", help="run Laya and rewrite results/ (needs [measure])")
    measure.add_argument("--sample", type=int, default=1000)
    args = parser.parse_args(argv)

    if args.command == "measure":
        from decision_tier.measure import measure as run_measure

        run_measure(RESULTS, sample=args.sample)
        return 0

    from decision_tier.report import render

    print(render(RESULTS), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
