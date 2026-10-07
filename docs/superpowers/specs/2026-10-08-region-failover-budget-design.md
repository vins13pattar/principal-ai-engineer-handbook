# Region failover budget lab — design

**Module:** 11 (Cloud). The last lab-shaped module without a lab; v1.0 waits on it.

## The question

Module 11 says a failover trigger should honour the RTO it is meant to protect, and shows a
`FailoverController` that "only triggers once every health check inside the RTO window has failed".
The question this lab answers: **what does that trigger actually do to recovery time, and what does
the alternative cost?**

Read closely, the module's controller has two properties nobody has measured:

1. **It spends the whole RTO on detection.** It cannot fire until a full RTO of consecutive
   unhealthy checks has accumulated, so detection alone takes ≈ RTO. Promotion, traffic shift, and
   warming the standby — for AI serving, loading model weights onto GPUs — all happen _after_ that.
   The trigger tied to the RTO guarantees the RTO is breached.
2. **It treats silence as health.** `if not recent: return False`. If the outage takes the health
   reporter with it, no checks arrive, and the controller never fails over.

The opposite fix — fire fast on a few failed probes — is not free either: transient blips that
recover on their own become failovers, and a failover is itself an incident. That is the trade the
lab measures.

## What it measures

**A. The trigger trade-off.** Over many seeded simulated days, for each trigger policy and
parameter, two numbers:

- **False failovers per day** — failovers fired when only transient blips occurred.
- **Detection delay** — time from the start of a real, sustained outage to the trigger firing.

Policies:

- `WindowAllUnhealthy(window)` — the module's controller, verbatim in behaviour.
- `ConsecutiveFailures(n)` — fire after `n` consecutive failed probes.
- Both with a **silence rule** variant: a probe that does not arrive within its interval counts as
  a failure, not as nothing.

**B. The recovery budget.** Detection delay plus the downstream stages, against the RTO:

`recovery = detection + promotion + traffic_shift + standby_warmup`

with standby tiers (hot / warm / cold) whose warm-up is driven by model size and weight-load
throughput. These downstream durations are **configured inputs, not measurements** — the lab says
so on every output — because they belong to the reader's platform. What the lab contributes is
detection's share of the budget, which is measured.

**C. The silent region.** A scenario where the prober dies with the region. The module's controller
never fires; the silence-rule variant does.

## Simulation, stated plainly

There is no cloud. Regions, probes, and blips are a seeded discrete-event simulation. That makes the
lab `production-shaped`, and the Build page says exactly what is simulated:

- Probes arrive at a fixed interval, with optional loss.
- Transient blips arrive as a Poisson process with durations drawn from a configurable distribution
  (default: exponential, mean a few probe intervals). Blips recover on their own.
- A sustained outage starts at a random time in the day and does not recover.

The blip distribution is the assumption that drives result A, so the CLI prints it with the results
and a test asserts that the trade-off's _shape_ holds across more than one setting of it.

## Constraints

- **No network, no cloud SDK, no credentials.** Pure Python standard library at runtime.
- **Deterministic.** Every sweep takes a seed; the same seed gives byte-identical output.
- **Tests assert shape, never constants.** E.g. false failovers fall as `n` rises; detection delay
  rises as `n` rises; `WindowAllUnhealthy` detection ≥ its window; silence-rule fires in the
  silent-region scenario and the original does not.
- **Gates:** `ruff`, `mypy --strict src tests`, `pytest`, run in every task.

## Out of scope for v1

- **RPO and replication lag.** Module 11's third failure mode. Simulating lag honestly needs a
  model of how lag behaves under the load that precedes an outage, and any such model would bake in
  the conclusion. Stated as a gap on the Build page.
- **IAM blast radius.** Already measured by the Agent Identity Broker lab.
