# region-failover-budget

How much of a recovery-time objective does a failover trigger spend just
deciding to fail over?

[Module 11](https://handbook.vinodspattar.in/learn/modules/11-cloud/) shows a
`FailoverController` that "only triggers once every health check inside the RTO
window has failed", and says that ties the trigger to the RTO it is meant to
honour. This lab runs that controller, and the obvious alternative, over
simulated regions, and measures both sides of the trade between failing over
too eagerly and too late.

There is no cloud. Regions, probes, blips, and outages are a seeded
discrete-event simulation, and the same seed prints byte-identical output.

## What it found

**A window tied to the RTO guarantees the RTO is missed.** A window trigger
cannot fire until the whole window has been unhealthy, so detection alone takes
the window -- and promotion, traffic shift, and loading model weights onto the
standby's GPUs all come after it. Set the window to the RTO, as the module
describes, and recovery overruns on every standby tier, hot included. The
window has to be sized from what the RTO leaves after the downstream stages,
not from the RTO itself.

**The rule's shape matters less than its patience.** A window of `W` seconds
behaves like `W / interval + 1` consecutive failures. What separates triggers is
how long they wait, and that one number sets both false failovers and
detection delay.

**Silence is read as health.** The module's controller returns `False` when
the window holds no checks -- so an outage that takes the prober down with the
region is never detected. In the default sweep it caught a dark region in 2 of
30 runs, both by luck: the region went dark mid-blip, so the last checks it held
were unhealthy, and they outlived the healthy ones. Counting a probe that never
arrived as a failure catches every one.

**A restarted controller fires on its first unhealthy probe.** With no
history, one unhealthy check is every check in the window. A controller that
restarts during a blip fails over immediately. See `tests/test_triggers.py`.

## What is simulated, and what is an input

| Thing | Status |
| --- | --- |
| Probe results, blips, outages | **Simulated.** Blips arrive as a Poisson process and last an exponentially distributed time; printed with every result |
| False failovers, detection delay | **Measured** on the simulation |
| Promotion, traffic shift, capacity, weight-load throughput | **Inputs, not measurements.** Round defaults in a plausible range; set them to your platform's |

The blip distribution is the assumption the false-failover rates rest on. The
tests check that the trade-off's _shape_ holds under more than one setting of
it; the magnitudes do not, and are not meant to.

## Not covered

- **RPO and replication lag** -- Module 11's third failure mode. An honest
  simulation needs a model of how lag behaves under the load that precedes an
  outage, and any such model would bake in the answer.
- **IAM blast radius** -- measured by the Agent Identity Broker lab.

## Running it

```bash
uv venv && uv pip install -e '.[dev]'
.venv/bin/python -m failover_budget                     # defaults
.venv/bin/python -m failover_budget --rto 300 --blip-mean 60
```

Default output:

```text
A. The trigger trade-off

   probe every 10s; blips Poisson at 4/h, exponential duration mean 20s; probe loss 0%
   30 seeds; false failovers over 1 calm day(s) per seed;
   detection measured from the start of a sustained outage

   trigger                                   false/day  detect p50  detect p95  missed
   window-all-unhealthy(60s)                      3.33         60s         60s       0
   window-all-unhealthy(300s)                     0.00        300s        300s       0
   window-all-unhealthy(900s)                     0.00        900s        900s       0
   consecutive(1)                                71.70          0s          0s       0
   consecutive(3)                                25.30         20s         20s       0
   consecutive(6)                                 5.97         50s         50s       0
   consecutive(12)                                0.20        110s        110s       0

B. The recovery budget

   RTO 900s. Downstream stages are inputs, not measurements:
   promotion 60s, traffic shift 120s, capacity 600s, 140 GB of weights at 1 GB/s

   detection the RTO leaves room for, by standby tier:
     hot   720s
     warm  580s
     cold  no trigger can meet it

   recovery at p50 detection                          hot          warm          cold
   window-all-unhealthy(60s)                      240s ok       380s ok     980s over
   window-all-unhealthy(300s)                     480s ok       620s ok   1,220s over
   window-all-unhealthy(900s)                 1,080s over   1,220s over   1,820s over
   consecutive(1)                                 180s ok       320s ok     920s over
   consecutive(3)                                 200s ok       340s ok     940s over
   consecutive(6)                                 230s ok       370s ok     970s over
   consecutive(12)                                290s ok       430s ok   1,030s over

C. The silent region

   the outage takes the prober with it: probes stop arriving instead of failing

   trigger                                    detected
   window-all-unhealthy(60s)                      2/30
   window-all-unhealthy(300s)                     2/30
   window-all-unhealthy(900s)                     2/30
   consecutive(1)                                 2/30
   consecutive(3)                                 0/30
   consecutive(6)                                 0/30
   consecutive(12)                                0/30
   window-all-unhealthy(60s, silence=fail)       30/30
   window-all-unhealthy(300s, silence=fail)      30/30
   window-all-unhealthy(900s, silence=fail)      30/30
   consecutive(1, silence=fail)                  30/30
   consecutive(3, silence=fail)                  30/30
   consecutive(6, silence=fail)                  30/30
   consecutive(12, silence=fail)                 30/30
```

## Quality gates

```bash
.venv/bin/python -m ruff check .
.venv/bin/python -m mypy src tests    # tests included, as in langgraph-checkpoint-cost
.venv/bin/python -m pytest -q
```

Every test asserts a shape -- more patience means fewer false failovers and
later detection; the silence rule catches what the original misses -- never a
specific count. The counts depend on the simulated blip rate, which is yours to
change.
