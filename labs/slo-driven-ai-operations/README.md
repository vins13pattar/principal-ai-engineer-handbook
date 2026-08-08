# SLO-Driven AI Operations Lab

**Status: `production-shaped`** — the control logic, tests, and failure handling are real; the
metrics source, scaling target, and paging integration are deliberately in-process stand-ins. See
[What would make this production-ready](#what-would-make-this-production-ready) for the exact gap.

A Python 3.12+ lab for the three mechanisms that turn "is the system healthy" from a feeling into an operational control loop: error-budget and burn-rate tracking against an SLO, a policy-driven autoscaling controller, and automated incident runbook execution with escalation.

## What this demonstrates

- an `SLOTracker` that records request outcomes and computes error-budget consumption against a target (e.g. 99.9% success);
- Google SRE workbook-style **multiwindow, multi-burn-rate alerting**: a burn rate only fires if it holds over both a long lookback window (avoids paging on a blip) and a short one (lets the alert clear quickly once the burn stops);
- an `AutoscalingController` that mirrors Kubernetes' Horizontal Pod Autoscaler proportional formula, with a cooldown to prevent flapping and an override that bypasses the cooldown the moment a fast error-budget burn is detected;
- a `Runbook`/`IncidentRunner` that executes remediation steps in order, each bounded by its own timeout, escalating to a named contact whenever a step doesn't resolve the incident, and reporting an honest "exhausted" outcome if every step runs out;
- a FastAPI service wiring all three together per named service, so an autoscaling decision and an incident's initial severity are both derived from the same live SLO report;
- deterministic async tests for every stage, using an injectable `MutableClock` so burn-rate and cooldown behavior is tested without any real waiting.

## Run locally

```bash
cd labs/slo-driven-ai-operations
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn platform_ops.app:app --reload
```

The app starts with one demo service, `checkout-api`, targeting 99.9% success over a 30-day budget window, and a demo three-step runbook: `restart_service` → `scale_up_capacity` → `page_on_call`.

Record request outcomes:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/services/checkout-api/requests \
  -H 'content-type: application/json' -d '{"success": true}'
```

Check the error-budget report:

```bash
curl -s http://127.0.0.1:8000/v1/services/checkout-api/slo
```

Ask the autoscaler for a decision:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/services/checkout-api/autoscale \
  -H 'content-type: application/json' -d '{"current_replicas": 4, "utilization": 0.9}'
```

Trigger an incident (severity is derived from the current SLO report) and fetch it back:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/incidents -H 'content-type: application/json' -d '{"service": "checkout-api"}'
curl -s http://127.0.0.1:8000/v1/incidents/inc-1
```

## Verify quality

```bash
pytest
ruff check .
mypy src
```

GitHub Actions runs these checks for changes under `labs/slo-driven-ai-operations`.

## Architecture

```text
POST /v1/services/{s}/requests {success}
  |
SLOTracker.record()                 -- appends a timestamped outcome, prunes anything
  |                                     older than the SLO's overall budget window
  |
SLOTracker.report()
  |-- for each BurnRateAlertRule: compute burn rate over a long AND a short window
  |-- a rule only "fires" if BOTH windows are over its threshold
  |-- highest-severity fired rule wins: PAGE > TICKET > OK
  |
  +--> AutoscalingController.decide(current_replicas, utilization, severity)
  |      |-- fast burn (severity == PAGE)?  -> scale up by one, bypass cooldown
  |      |-- else, in cooldown?             -> hold
  |      |-- else                           -> HPA-style proportional target,
  |                                             clamped to [min_replicas, max_replicas]
  |
  +--> IncidentRunner.run(severity)
         |-- step 1: action(context), bounded by asyncio.timeout
         |     |-- resolved?  -> done, status RESOLVED
         |     |-- else       -> escalate_to this step's contact, run step 2
         |-- ... repeat until resolved or steps are exhausted
         |-- exhausted        -> status EXHAUSTED, final_escalation = last contact paged
```

## Why burn rate needs two windows, not one

A single-window burn-rate check trades off badly no matter which window you pick: a short window alone pages on any brief blip and then flaps once it passes; a long window alone takes too long to catch a real fast burn. Requiring both a long window (e.g. 1h) and a short window (e.g. 5m) to independently cross the same threshold gets both properties: the long window filters out noise, and the short window lets the page clear within minutes of the burn actually stopping, instead of staying stuck at the long window's stale average.

## Why the autoscaler has an SLO-driven override, not just a utilization trigger

A utilization-only autoscaler is blind to the reason utilization is high. If a fast error-budget burn is underway, waiting out a cooldown timer to protect against flapping is actively harmful — the service is failing customers *right now*. The controller checks burn-rate severity before it checks cooldown, so a page-level burn always gets a capacity response, even mid-cooldown; every other scaling decision still respects the cooldown to avoid reacting to noisy utilization samples.

## Why the runbook escalates instead of retrying the same step

Retrying an already-failed remediation step assumes the step's own action was the problem, when the more common failure is that the step was the wrong remediation entirely (a restart won't fix a capacity problem). Moving to the *next* step — with an explicit named escalation target recorded at each hop — produces an audit trail of who was notified and when, instead of a service silently retrying the same ineffective action while the incident continues.

## Principal-level discussion points

1. An error budget reframes reliability as a number you can spend, not just a target you either hit or miss — it's what lets a team trade some reliability investment for feature velocity in a principled way.
2. Multiwindow, multi-burn-rate alerting exists specifically to fix the false-positive/false-negative trade-off a single-window threshold can't escape; it's worth being able to state that trade-off precisely in an interview, not just name the technique.
3. `promote`/`rollback`-style reversible actions (Module 6) and this lab's cooldown-bypassing override are the same underlying idea: safety mechanisms should have an explicit, principled escape hatch for the case they weren't designed to slow down.
4. A runbook's `EXHAUSTED` status is a feature, not a bug in the design — an incident automation system that silently keeps retrying instead of honestly reporting "I'm out of steps, a human owns this now" hides the exact information an on-call engineer needs first.
5. Deriving both the autoscaling decision and the incident's starting severity from the same `SLOTracker.report()` call means the two subsystems can never disagree about how bad things currently are — a common source of confusing, contradictory automation in real incidents.

## What would make this production-ready

This lab is labelled `production-shaped`, not `production-ready`. The distinction is deliberate:
the control logic is real and tested, but three things a production deployment depends on are
simulated in-process. Each is a genuine integration, not a TODO.

| Simulated here | Production needs |
| --- | --- |
| Request outcomes recorded via HTTP into an in-memory list | A metrics backend — Prometheus range queries or equivalent — read behind the same `Clock` seam |
| `ScalingDecision` returned as JSON to the caller | A real scaling target: Kubernetes HPA custom metrics, or a cloud autoscaling group API |
| `page_on_call` returning `True` after a sleep | A paging provider, with acknowledgment tracking and a real escalation policy |
| SLO history and incidents held per `PlatformOperationsCenter` instance | Durable storage, so history survives restarts and is shared across replicas |

Until those exist, the lab demonstrates the reasoning correctly and would not survive contact with
production traffic. That gap is the point of the label.

## Remaining exercises

- Replace the in-memory outcome window with Prometheus range queries behind the existing `Clock`
  seam — the injectable clock was designed to make exactly this substitution testable.
- Add the second pair of Google SRE workbook rules (a slower 3-day/6-hour ticket-level pair)
  alongside the two included here.
- Make the runbook's steps interruptible mid-execution by an operator, instead of always running to
  resolution or exhaustion.
- Extend escalation to page multiple contacts in parallel with acknowledgment tracking, instead of
  a single named contact per step.
- Add a `Dockerfile`, deployment manifest, and load profile, matching
  [`labs/async-ai-gateway`](../async-ai-gateway/) — the reference for what `production-ready` means
  in this repository.
