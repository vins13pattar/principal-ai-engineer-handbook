# Model Router

Companion lab for [Module 4: AI Infrastructure](https://handbook.vinodspattar.in/learn/modules/04-ai-infrastructure/).

**Status: production-shaped.** The routing logic is complete and tested; no model is ever called.
See [What is deliberately simulated](#what-is-deliberately-simulated).

Task-based routing: **capability first, then cost.** Plus a measurement of when escalating from a
cheap model to an expensive one actually pays — which produced a result I did not expect.

This is not the health-aware routing in [`async-ai-gateway`](../async-ai-gateway), which picks
between *replicas of equivalent providers* by success rate. This lab picks between *models of
different capability and price* by what the task needs.

## The finding

Escalation — try the cheap model, fall back to the expensive one when it looks unsure — is standard
advice, and the intuition is that it saves money while keeping quality. The first version of this
lab's test suite asserted exactly that. **It failed, and the failure was right.**

Measured over a fixed 200-task workload, with a *perfect* confidence signal:

| | Cheap only | Escalating |
| --- | --- | --- |
| Correct | 166 / 200 | 197 / 200 |
| Total cost | 0.040 | 0.550 |
| Cost per correct answer | 0.00024 | **0.00279** |

Escalation improved accuracy by 19% and made cost per correct answer **11× worse**. And it is not
an artefact of the 75× price gap between the tiers — the same relationship holds at 10×, at 5×, and
at 2×:

```
cost ratio  cheap $/correct  esc $/correct  better?
         2         0.000241       0.000272       no
         5         0.000241       0.000376       no
        10         0.000241       0.000548       no
        75         0.000241       0.002792       no
```

The reason is arithmetic, not modelling. A cheap model that is already right 83% of the time
contributes a large number of cheap correct answers. Escalation adds a smaller number of expensive
ones. The average can only move upward.

**So cost per correct answer is the wrong metric**, and it is the one everybody reaches for. The
number that decides is the *marginal* cost of each answer escalation rescued:

```
marginal cost per rescued answer = (escalated_cost - baseline_cost) / (escalated_correct - baseline_correct)
```

At a 2× ratio that is about £0.00044 per rescued answer; at 75× it is about £0.016. Whether either
is worth paying depends on what a wrong answer costs you — a product question the router cannot
answer, and should not pretend to.

## What it implements

| Piece | What it does |
| --- | --- |
| `registry.py` | Capability filtering — which models may serve this task class at all |
| `policy.py` | `CheapestCapable`, `QualityFloor`, `BudgetCapped` |
| `router.py` | Capability filter, then policy; plus the escalation loop |
| `execution.py` | A deterministic simulated model, and the informative/uninformative confidence switch |
| `workload.py` | Runs a workload under a strategy and reports cost, accuracy, and the marginal number |

Two design points the tests pin:

- **Capability filtering happens before cost.** `small` is the cheapest model in the fleet and
  cannot write code. A router that sorted by price first would pick it and be cheap, fast, and
  wrong.
- **Ties break on name, not registration order.** A router whose choice depends on dict iteration
  produces cost reports nobody can reconcile across runs.

## Run it

```bash
uv venv .venv && uv pip install --python .venv/bin/python -e '.[dev]'
./.venv/bin/python -m ruff check .
./.venv/bin/python -m mypy src
./.venv/bin/python -m pytest -q
```

16 tests, `ruff` clean, `mypy --strict` clean.

## What is deliberately simulated

- **The models.** Nothing is called. `execution.py` decides correctness from a seeded hash of
  (model, task), so a run is reproducible and results are a property of the routing policy rather
  than of sampling noise.
- **Costs and quality scores.** Lab fixtures chosen for their *relative* ordering. They are not any
  vendor's pricing and not benchmark results. Nothing in the tests depends on their absolute values.
- **The confidence signal.** Real models do not expose a clean calibrated confidence. The
  `INFORMATIVE` case here is the best case any escalation policy could hope for, which makes it the
  fairest one to measure against — and the results are still unflattering.
- **Latency.** Not modelled at all. The cost-latency-quality triangle in Module 4 has three corners;
  this lab measures two.
- **Health and failure.** No timeouts, no retries, no provider outages. That is
  [`async-ai-gateway`](../async-ai-gateway)'s job, and duplicating it here would blur what each lab
  is for.

## Exercises

1. **Find the break-even.** Add a per-wrong-answer cost to `WorkloadResult` and compute where
   escalation becomes net-positive. That threshold is the number to take to a budget conversation.
2. **Make the signal partially informative.** Interpolate between the two `ConfidenceSignal` modes —
   confidence correct 70% of the time — and find how good the signal must be before escalation earns
   its keep at a 10× ratio.
3. **Route on observed quality, not declared quality.** `ModelSpec.quality` is a static claim. Feed
   measured outcomes back in and let the registry update itself, then decide what happens on a cold
   start with no observations.
4. **Add latency.** Give each model a latency and add a deadline to `Task`. Escalation now spends
   time as well as money, and a task that escalates may miss its deadline entirely.
