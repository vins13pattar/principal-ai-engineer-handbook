# Evaluation Platform

Companion lab for [Module 4: AI Infrastructure](https://handbook.vinodspattar.in/learn/modules/04-ai-infrastructure/)
and [Module 12: Observability](https://handbook.vinodspattar.in/learn/modules/12-observability/).

**Status: production-shaped.** The harness and statistics are complete and tested; no model is
called. See [What is deliberately simulated](#what-is-deliberately-simulated).

An evaluation platform's job is not to produce a number. It is to say whether a difference between
two numbers is real. This lab computes what that actually costs in examples.

## The finding

**Examples needed per arm** to detect an improvement at 95% confidence and 80% power:

| Baseline | +1pt | +2pt | +3pt | +5pt | +10pt |
| --- | --- | --- | --- | --- | --- |
| 70% | 32,644 | 8,077 | 3,551 | 1,248 | 291 |
| 80% | 24,638 | 6,036 | 2,626 | 903 | 197 |
| 85% | 19,458 | 4,722 | **2,033** | 683 | 138 |
| 90% | 13,493 | 3,211 | 1,353 | 432 | 71 |

And the inverse — **the smallest delta a set of a given size can see**, at an 85% baseline:

| n | Smallest visible delta |
| --- | --- |
| 30 | 25.8% |
| 50 | 20.0% |
| 100 | 14.1% |
| 500 | 6.3% |
| 1,000 | 4.5% |
| 5,000 | 2.0% |

So a fifty-example eval set cannot resolve anything below about twenty percentage points. Every
smaller movement it reports is noise being read as signal.

Concretely, the shape of most "we improved it" claims:

```
84% -> 88% on 50 examples
delta +4.0%,  95% CI [-9.6%, +17.6%],  significant: False
```

The same data is consistent with a ten-point **regression**. The point estimate alone is not a
measurement.

Effect size enters squared, so halving the delta you want to see at least quadruples the dataset —
measured at 4.95× here rather than the naive 4×, because as the candidate rate approaches 1.0 its
variance shrinks and the coarse measurement gets disproportionately cheap.

## `None` is a real answer

`Comparison.is_significant()` returns `True`, `False`, or **`None`**. The third case means the
normal approximation is not usable — expected cell counts below about five, which is exactly the
regime small eval sets live in.

Returning `False` there would say "no difference" when the honest answer is "this set cannot tell",
and those get acted on very differently: the first stops the investigation, the second should start
one about the eval set.

## The meta-test

`test_the_harness_catches_a_deliberately_broken_system` scores a system that is always wrong and
asserts it gets 0%. Everything else in the suite is worthless if that fails — an eval that cannot
fail is not an eval. Its twin asserts a perfect system scores 100%, because a harness that always
fails is equally useless.

## What else it implements

| Piece | What it does |
| --- | --- |
| `graders.py` | Exact, normalised, and contains — ordered most to least trustworthy |
| `runner.py` | Runs a dataset; detects flaky examples across repeats |
| `dataset.py` | Golden examples, each flagged with whether a human ever verified it |
| `significance.py` | Confidence intervals, required sample size, smallest detectable delta |

Three things the tests pin that are easy to get wrong:

- **The `contains` grader passes an answer that says both things.** An output containing the right
  answer *and* its opposite scores as correct. That is what verbose model output looks like.
- **Flaky examples are named, not averaged away.** Averaging across repeats hides instability behind
  a plausible number; naming the unstable examples is what lets someone fix or remove them.
- **An unverified dataset is visible as such.** An eval set built from the system's own past output
  measures agreement with a former self, not correctness, and cannot detect a regression that was
  always there. Nothing in the accuracy number reveals this, so `Example` carries the flag.

## Run it

```bash
uv venv .venv && uv pip install --python .venv/bin/python -e '.[dev]'
./.venv/bin/python -m ruff check . && ./.venv/bin/python -m mypy src && ./.venv/bin/python -m pytest -q
```

17 tests, `ruff` clean, `mypy --strict` clean.

## What is deliberately simulated

- **The system under test.** No model is called. Systems are deterministic functions of
  `(question, attempt)` with a configured accuracy, which is what lets the tests assert on the
  statistics rather than on a model's mood.
- **The statistics.** A two-proportion normal approximation, implemented directly so the arithmetic
  is visible and there is no heavy dependency. It is not a bootstrap, not exact, and it refuses to
  answer outside its validity range rather than answering badly.
- **Graders.** Three string comparisons. There is no LLM-as-judge here, deliberately: a judge is the
  least verifiable grader and would need its own evaluation before it could evaluate anything.
- **Paired analysis.** Two independent proportions. Because both arms run the *same* examples, a
  paired test (McNemar) would be more powerful and would need fewer examples than the table above
  suggests — see the exercises.

## Exercises

1. **Use a paired test.** Both runs cover the same examples, so the unpaired numbers above are
   conservative. Implement McNemar's test over the disagreement counts and re-derive the table —
   then decide whether the reduction changes any decision you would make.
2. **Add multiple-comparison correction.** Run five prompt variants against one baseline and count
   how often at least one looks significant by chance. Then apply Bonferroni and watch the required
   sample size grow again.
3. **Make the flaky detector actionable.** Have it quarantine unstable examples into a separate
   report and re-run the statistics without them — then argue about whether excluding them is
   honest, because sometimes it is not.
4. **Break the harness on purpose.** Make `ExactMatch.grade` always return `True` and confirm the
   meta-test fails. If it does not, the meta-test is decoration.
