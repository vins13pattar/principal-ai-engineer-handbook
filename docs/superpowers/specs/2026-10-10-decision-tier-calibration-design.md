# Decision tier calibration lab — design

**Plan:** `docs/superpowers/plans/2026-10-08-system-one-decision-models.md`, phase 3.

## The question

A decision model returns a probability with every answer, and the whole case for a decision tier
rests on acting on it: keep the confident answers, escalate the rest. Nobody has published,
independently, whether those probabilities can bear that weight. This lab measures it for the one
decision model whose weights are open — Laya — on human-labelled data.

## Why not the vendors' benchmark

TypeSafe's eval suite (`typesafe/evalsafe-*`), the set Laya, Jev, and Clef all report against,
labels its cases by consensus of OpenAI and Anthropic models: "Labels are model-generated
references." Accuracy on it is agreement with LLMs, and calibration against it would be
calibration to LLM agreement. It also declares no license. The lab uses human-labelled sets with
explicit licenses instead, and says why.

## Data

| Set                                         | License    | Question | Options |
| ------------------------------------------- | ---------- | -------- | ------- |
| `zeroshot/twitter-financial-news-sentiment` | MIT        | `choice` | 3       |
| `fancyzhx/amazon_polarity`                  | Apache-2.0 | `noul`   | 2       |
| `PolyAI/banking77`                          | CC-BY-4.0  | `choice` | 77      |

A seeded sample from each evaluation split. Only numbers are committed — per-example
probabilities, the label index, and the source row index — never the text.

## What it measures

- **As shipped:** accuracy and expected calibration error (ECE), against majority-class and
  random baselines.
- **Temperature fitting:** fitted on one seeded half, evaluated on the other. Never on the same
  examples.
- **The threshold curve:** coverage (share of traffic the tier keeps) against accuracy on what it
  keeps, as the threshold on the top probability rises.
- **A threshold fitted for a target error**, on the fit half, and the error it actually delivers on
  the held-out half — the number a team deploying this would live with.
- **Two signals:** the top probability, and TypeSafe-style `confidence`, which rescales by option
  count. The same threshold means a different top probability at 3 options than at 77.

## Constraints

- **Two halves of the lab.** `measure` needs torch, the checkpoint, and the datasets; it runs
  locally and writes `results/`. Everything else is pure Python over committed results and runs
  in CI with no model, no network, and no GPU.
- **Pinned.** `laya==0.4.1` at the revision in `laya.PINNED_REVISIONS`; recorded in
  `results/meta.json` with device, dates, and sample sizes.
- **Tests assert shapes, never Laya's numbers.** Synthetic records with known miscalibration
  check that the metrics recover it; the committed results are checked for schema and that the
  report reproduces from them byte for byte.
- **Gates:** `ruff`, `mypy --strict src tests`, `pytest`.

## Not in scope

- `score` questions. No human-labelled ordinal set with a clear license was in reach.
- Fine-tuning. Laya's card says its accuracy depends on it; this lab measures what a team gets on
  the first day, which is the version a vendor benchmark never shows.
- Jev, Clef, and OpenAI. Their probabilities come from hosted APIs behind credentials and, for
  OpenAI, an undocumented schema. The analysis half would take their records unchanged; only a
  `measure` adapter is missing.
