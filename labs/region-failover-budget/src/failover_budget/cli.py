"""Print the three results: the trade-off, the budget, and the silent region.

failover-budget                 # the defaults: 30 seeds, RTO 15 minutes
failover-budget --rto 300 --blip-mean 60
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from dataclasses import replace

from failover_budget.budget import STANDBY_TIERS
from failover_budget.sweep import SweepConfig, SweepResult, run_sweep


def _seconds(value: float | None) -> str:
    return "never" if value is None else f"{value:,.0f}s"


def render(result: SweepResult) -> str:
    config = result.config
    lines: list[str] = []
    out = lines.append

    out("A. The trigger trade-off")
    out("")
    out(f"   {config.calm().describe()}")
    out(f"   {config.seeds} seeds; false failovers over {config.calm_days:g} calm day(s) per seed;")
    out("   detection measured from the start of a sustained outage")
    out("")
    out(f"   {'trigger':<40} {'false/day':>10} {'detect p50':>11} {'detect p95':>11} {'missed':>7}")
    for row in result.tradeoff:
        out(
            f"   {row.label:<40} {row.false_per_day:>10.2f} "
            f"{_seconds(row.median_detection):>11} {_seconds(row.p95_detection):>11} "
            f"{row.missed:>7}"
        )
    out("")

    out("B. The recovery budget")
    out("")
    out(f"   RTO {config.rto:,.0f}s. Downstream stages are inputs, not measurements:")
    out(f"   {config.platform.describe()}")
    out("")
    tiers = list(STANDBY_TIERS)
    out("   detection the RTO leaves room for, by standby tier:")
    for name in tiers:
        allowance = result.allowances[name]
        verdict = "no trigger can meet it" if allowance < 0 else f"{allowance:,.0f}s"
        out(f"     {name:<5} {verdict}")
    out("")
    header = "".join(f"{name:>14}" for name in tiers)
    out(f"   {'recovery at p50 detection':<40}{header}")
    for budget_row in result.budget:
        cells = ""
        for name in tiers:
            total = budget_row.totals[name]
            if total is None:
                cells += f"{'never':>14}"
            else:
                mark = "over" if total > config.rto else "ok"
                cells += f"{f'{total:,.0f}s {mark}':>14}"
        out(f"   {budget_row.label:<40}{cells}")
    out("")

    out("C. The silent region")
    out("")
    out("   the outage takes the prober with it: probes stop arriving instead of failing")
    out("")
    out(f"   {'trigger':<40} {'detected':>10}")
    for silent in result.silent:
        out(f"   {silent.label:<40} {f'{silent.detected}/{silent.runs}':>10}")
    return "\n".join(lines) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    defaults = SweepConfig()
    parser = argparse.ArgumentParser(prog="failover-budget", description=__doc__)
    parser.add_argument("--seeds", type=int, default=defaults.seeds)
    parser.add_argument("--calm-days", type=float, default=defaults.calm_days)
    parser.add_argument("--rto", type=float, default=defaults.rto, help="seconds")
    parser.add_argument("--blips-per-hour", type=float, default=defaults.blips_per_hour)
    parser.add_argument("--blip-mean", type=float, default=defaults.blip_mean_seconds)
    args = parser.parse_args(argv)

    config = replace(
        defaults,
        seeds=args.seeds,
        calm_days=args.calm_days,
        rto=args.rto,
        blips_per_hour=args.blips_per_hour,
        blip_mean_seconds=args.blip_mean,
    )
    print(render(run_sweep(config)), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
