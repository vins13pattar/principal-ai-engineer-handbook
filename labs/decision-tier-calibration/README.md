# decision-tier-calibration

Can a decision model's probabilities carry an escalation threshold?

A decision model -- Jev, Laya, Clef -- answers a typed question with a
probability over the answers you allowed. The case for putting one in front of
an LLM rests on acting on that number: keep the confident answers, hand the
rest to something slower. This lab measures whether the number can bear that
weight, for the one decision model whose weights are open (Laya, Apache-2.0),
on **human-labelled** data, zero-shot -- the version a team gets on day one.

## What it found

**Phrasing decides whether a yes/no question works at all.** The same 1,000
Amazon reviews, the same decision, asked three ways:

| Question | Accuracy | ECE as shipped |
| --- | --- | --- |
| `noul`: "Is this product review positive?" | 52.9% -- the majority baseline | 0.477 |
| `noul`: "Does the reviewer like the product?" | 91.2% | 0.076 |
| `choice`: negative / positive | 94.2% | 0.016 |

The first phrasing is not just wrong; it is wrong with total confidence: 998
of 1,000 answers were stated at 100%. A decision tier built on it would pass
every review straight through, sure of itself, and nothing downstream would
notice. Laya's own card notes that `noul` answers can follow their option
labels rather than the state; this is that, measured.

**At 77 options, confidence inverts.** On Banking77 the model is
underconfident where it is unsure (stated 9%, right 23%) and badly
overconfident where it is sure (stated 96%, right 64%). One temperature cannot
fix miscalibration that runs in both directions -- fitting it moved ECE from
0.178 to 0.177 -- and no threshold reaches a 10% error rate: answers given 0.99
or more are right 73% of the time.

**At 3 options, a decision tier is viable.** On financial-tweet sentiment,
calibration is reasonable (ECE 0.059), and a threshold fitted on one half for a
10% error rate delivered 11.0% on the other half while keeping 61% of traffic.

**Temperature scaling is not a general fix.** It improved ECE in two of five
cases. One is real: the reworded `noul`, 0.076 to 0.026. The other is not: on the
broken phrasing it moved ECE from 0.477 to 0.262 only by teaching a coin flip to
admit it is one -- accuracy stayed at 52.9%. On the other three it was neutral
or slightly worse. Fitting to minimise log-likelihood is not the same as fitting to make the
top answer's confidence honest.

## Why not the vendors' benchmark

TypeSafe's eval suite (`typesafe/evalsafe-*`), the one Laya, Jev, and Clef all
report against, is labelled by a consensus of OpenAI and Anthropic models --
"Labels are model-generated references", per its own card. Accuracy on it is
agreement with LLMs, and calibration against it would be calibration to LLM
agreement. It also declares no license. This lab uses three human-labelled
sets with explicit licenses instead:

| Set | License | Question |
| --- | --- | --- |
| `zeroshot/twitter-financial-news-sentiment` | MIT | `choice`, 3 options |
| `fancyzhx/amazon_polarity` | Apache-2.0 | `noul` (twice) and `choice`, 2 options, same rows |
| `legacy-datasets/banking77` | CC-BY-4.0 | `choice`, 77 options |

Banking77 comes from the Hub's maintained copy because the official
`PolyAI/banking77` repo still ships a loading script that current `datasets`
refuses. Same data, same license.

## Two halves

**`measure`** runs Laya (`laya==0.4.1`, pinned to the revision in
`laya.PINNED_REVISIONS`) over a seeded sample of 1,000 rows per set and writes
`results/`. It needs torch, the ~800 MB checkpoint, and the network, so it runs
locally and never in CI. Only numbers are written -- the row index, the human
label, the probabilities -- never the text.

**`report`** is pure Python over the committed results: no model, no numpy, no
network. It is what CI runs, and it reproduces byte for byte. Every calibration
fit is made on one seeded half and judged on the other.

## Running it

```bash
uv venv && uv pip install -e '.[dev]'
.venv/bin/python -m decision_tier report          # from committed results

uv pip install -e '.[measure]'                    # local only
.venv/bin/python -m decision_tier measure         # rewrites results/
```

## The report

```text
Laya 0.4.1 @ 55cf4c4ebb4e, mps, measured 2026-10-10

== twitter-financial-sentiment  (choice, 3 options, 1000 records)
   source: zeroshot/twitter-financial-news-sentiment [validation], MIT
   truncated by the model: 0
   distinct top-probability values: 901

   accuracy             78.4%
   majority baseline    66.4%
   random baseline      33.3%

   calibration on the held-out half (519; fitted on 481)
     ECE as shipped               0.059
     temperature fitted           0.77
     ECE after temperature        0.062

   reliability as shipped, all records: stated confidence vs actual accuracy
     0.2-0.4   n=1    stated  36.0%   right 100.0%
     0.4-0.6   n=192  stated  52.8%   right  53.6%
     0.6-0.8   n=389  stated  71.2%   right  77.9%
     0.8-1.0   n=418  stated  87.2%   right  90.2%

   threshold on top probability, held-out half
     threshold   shipped: keeps  right   |  after temperature: keeps  right
          0.50    92.9%  80.1%   |   97.5%  78.7%
          0.60    78.4%  84.8%   |   86.1%  83.0%
          0.70    63.4%  88.8%   |   74.4%  86.3%
          0.80    41.0%  87.8%   |   60.3%  89.5%
          0.90    11.9%  88.7%   |   34.5%  89.9%
          0.95     2.9%  93.3%   |   14.3%  90.5%
          0.99     0.0%    -     |    0.4% 100.0%

   a threshold fitted for 10.0% error on the fit half,
   then used on the held-out half
     shipped            threshold 0.7170: keeps  61.1%, error  11.0%
     after temperature  threshold 0.7928: keeps  61.5%, error  11.0%

   top probability 0.90 is TypeSafe-style confidence 0.850 at 3 options

== amazon-noul-is-positive  (noul, 2 options, 1000 records)
   source: fancyzhx/amazon_polarity [test], Apache-2.0
   truncated by the model: 0
   distinct top-probability values: 7

   accuracy             52.9%
   majority baseline    52.9%
   random baseline      50.0%

   calibration on the held-out half (503; fitted on 497)
     ECE as shipped               0.477
     temperature fitted           20.09
     ECE after temperature        0.262

   reliability as shipped, all records: stated confidence vs actual accuracy
     0.4-0.6   n=2    stated  53.8%   right  50.0%
     0.8-1.0   n=998  stated 100.0%   right  52.9%

   threshold on top probability, held-out half
     threshold   shipped: keeps  right   |  after temperature: keeps  right
          0.50   100.0%  52.3%   |  100.0%  52.3%
          0.60   100.0%  52.3%   |   99.6%  52.1%
          0.70   100.0%  52.3%   |   91.3%  53.6%
          0.80   100.0%  52.3%   |    0.0%    -  
          0.90   100.0%  52.3%   |    0.0%    -  
          0.95   100.0%  52.3%   |    0.0%    -  
          0.99   100.0%  52.3%   |    0.0%    -  

   a threshold fitted for 10.0% error on the fit half,
   then used on the held-out half
     shipped            no threshold reaches it with 30 or more answers kept
     after temperature  no threshold reaches it with 30 or more answers kept

== amazon-noul-likes-product  (noul, 2 options, 1000 records)
   source: fancyzhx/amazon_polarity [test], Apache-2.0
   truncated by the model: 0
   distinct top-probability values: 829

   accuracy             91.2%
   majority baseline    52.9%
   random baseline      50.0%

   calibration on the held-out half (473; fitted on 527)
     ECE as shipped               0.076
     temperature fitted           0.63
     ECE after temperature        0.026

   reliability as shipped, all records: stated confidence vs actual accuracy
     0.4-0.6   n=45   stated  55.1%   right  62.2%
     0.6-0.8   n=258  stated  72.8%   right  83.7%
     0.8-1.0   n=697  stated  90.5%   right  95.8%

   threshold on top probability, held-out half
     threshold   shipped: keeps  right   |  after temperature: keeps  right
          0.50   100.0%  90.5%   |  100.0%  90.5%
          0.60    94.5%  92.4%   |   97.0%  91.7%
          0.70    86.3%  93.6%   |   92.8%  92.5%
          0.80    67.0%  95.6%   |   85.4%  93.6%
          0.90    34.5%  97.5%   |   67.7%  95.6%
          0.95    19.2%  97.8%   |   44.4%  96.2%
          0.99     9.7%  97.8%   |   19.9%  97.9%

   a threshold fitted for 10.0% error on the fit half,
   then used on the held-out half
     shipped            threshold 0.5031: keeps  99.8%, error   9.3%
     after temperature  threshold 0.5049: keeps  99.8%, error   9.3%

== amazon-choice  (choice, 2 options, 1000 records)
   source: fancyzhx/amazon_polarity [test], Apache-2.0
   truncated by the model: 0
   distinct top-probability values: 613

   accuracy             94.2%
   majority baseline    52.9%
   random baseline      50.0%

   calibration on the held-out half (505; fitted on 495)
     ECE as shipped               0.016
     temperature fitted           0.80
     ECE after temperature        0.022

   reliability as shipped, all records: stated confidence vs actual accuracy
     0.4-0.6   n=32   stated  55.7%   right  46.9%
     0.6-0.8   n=53   stated  71.5%   right  71.7%
     0.8-1.0   n=915  stated  96.0%   right  97.2%

   threshold on top probability, held-out half
     threshold   shipped: keeps  right   |  after temperature: keeps  right
          0.50   100.0%  93.7%   |  100.0%  93.7%
          0.60    97.6%  94.7%   |   97.8%  94.7%
          0.70    95.4%  95.9%   |   95.8%  95.9%
          0.80    91.9%  96.6%   |   93.9%  96.4%
          0.90    82.6%  98.1%   |   87.3%  97.5%
          0.95    68.3%  98.3%   |   81.0%  98.0%
          0.99    14.7% 100.0%   |   47.5%  99.2%

   a threshold fitted for 10.0% error on the fit half,
   then used on the held-out half
     shipped            threshold 0.5034: keeps 100.0%, error   6.3%
     after temperature  threshold 0.5043: keeps 100.0%, error   6.3%

== banking77  (choice, 77 options, 1000 records)
   source: legacy-datasets/banking77 [test], CC-BY-4.0
   truncated by the model: 0
   distinct top-probability values: 851

   accuracy             40.6%
   majority baseline     1.9%
   random baseline       1.3%

   calibration on the held-out half (468; fitted on 532)
     ECE as shipped               0.178
     temperature fitted           1.58
     ECE after temperature        0.177

   reliability as shipped, all records: stated confidence vs actual accuracy
     0.0-0.2   n=361  stated   9.3%   right  23.0%
     0.2-0.4   n=158  stated  29.3%   right  37.3%
     0.4-0.6   n=114  stated  49.4%   right  39.5%
     0.6-0.8   n=89   stated  70.1%   right  46.1%
     0.8-1.0   n=278  stated  95.9%   right  64.0%

   threshold on top probability, held-out half
     threshold   shipped: keeps  right   |  after temperature: keeps  right
          0.50    41.2%  60.1%   |   25.2%  72.0%
          0.60    36.1%  65.1%   |   20.7%  75.3%
          0.70    32.5%  67.1%   |   17.3%  74.1%
          0.80    28.2%  70.5%   |   14.5%  75.0%
          0.90    22.9%  73.8%   |   11.1%  73.1%
          0.95    19.4%  75.8%   |    9.2%  79.1%
          0.99    12.8%  73.3%   |    7.9%  78.4%

   a threshold fitted for 10.0% error on the fit half,
   then used on the held-out half
     shipped            no threshold reaches it with 30 or more answers kept
     after temperature  no threshold reaches it with 30 or more answers kept

   top probability 0.90 is TypeSafe-style confidence 0.899 at 77 options
```

## What it does not cover

- **`score` questions.** No human-labelled ordinal set with a clear license was
  in reach.
- **Fine-tuning.** Laya's card says its headline accuracy depends on it. This
  lab measures the model as shipped -- the version no vendor benchmark shows.
- **Jev, Clef, OpenAI.** Their probabilities sit behind hosted APIs and, for
  OpenAI, an undocumented schema. The report would take their records
  unchanged; only a `measure` adapter is missing.

## Quality gates

```bash
.venv/bin/python -m ruff check .
.venv/bin/python -m mypy src tests
.venv/bin/python -m pytest -q
```

The metric tests use synthetic records with miscalibration put there on
purpose, and assert the metrics recover it. ECE was also cross-checked against
Laya's own `ece_score` on all five measured sets: identical to four decimals.
