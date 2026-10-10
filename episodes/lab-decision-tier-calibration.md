# Decision Tier Calibration: Why a Probability Isn't a Promise

_A decision model's confidence number is only as trustworthy as the wording that produced it and the option count it's spread across — and this lab is the independent, human-labelled measurement that shows exactly where that trust holds and where it silently breaks._

- **Source:** [lab:decision-tier-calibration](/build/labs/decision-tier-calibration/)
- **Runtime:** 7:18 · 16 turns · 4 beats
- **Written by:** claude-sonnet-5 on 2026-10-10
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. Starting from scratch: why the usual benchmark won't do

**Host:** So here's the question we're starting with: when a decision model hands you a confidence score, who actually checked that number against reality? Most of the industry points to one eval suite — the same one everybody cites — and calls it a day. But there's a problem baked into that suite that we need to talk about before we go any further.

**Guest:** Right, and it's a pretty fundamental one. The eval suite that Laya, Jev, and Clef all report against labels its test cases using a consensus of OpenAI and Anthropic models — that's not my interpretation, it's on the suite's own card. So when you compute an accuracy figure against it, you're not measuring agreement with human judgment, you're measuring agreement with other LLMs. Calibrating to that benchmark is calibrating to LLM consensus, which is circular if the whole point is to know whether these models reflect reality. It also doesn't even declare a license, which is its own red flag.

**Host:** So that's the credibility problem this lab exists to fix. Walk me through the alternative — three human-labelled datasets, actual licenses, and a discipline around how the numbers get produced and checked.

**Guest:** Exactly — we use three openly licensed, human-labelled sets: a Twitter financial sentiment dataset under MIT, Amazon Polarity under Apache-2.0, and Banking77 under CC-BY-4.0. Only numbers ever get committed, never the underlying text — row index, human label, probabilities, that's it. Every threshold and temperature is fitted on one seeded half of the data and tested on the other half it never saw, our own calibration metric is cross-checked against Laya's built-in score to four decimal places, and the metric tests use synthetic miscalibration to prove they can actually fail. The whole report reproduces in CI from committed results alone — no model, no GPU, no network required.

---

## 2. One rewording, chance to 91%

**Host:** So let's get to the headline number, because when I first saw this I thought it had to be a typo. Same 1,000 Amazon reviews, same underlying decision — positive or negative — and just by changing the phrasing of the question, accuracy goes from 52.9% to 91% to 94%?

**Guest:** No typo. 'Is this product review positive?' gets you 52.9% — that's literally the majority baseline, the model is contributing nothing. But it's worse than useless, because 998 of those 1,000 answers were stated at 100% confidence. Reword it to 'Does the reviewer like the product?' and you jump to 91.2%, ECE drops from 0.477 to 0.076. Switch to a forced choice between negative and positive and you're at 94.2%, ECE 0.016. Same model, same reviews, same decision — just different words asking for it.

**Host:** And that first version isn't just wrong, it's wrong with total certainty — so a decision tier built on it would wave everything through and never flag a single case for review, because there's nothing below the threshold to escalate.

**Guest:** Right, no threshold could ever catch that failure, because the model isn't hedging — it's confidently committing to the wrong answer every time. We actually found this by accident, probing whether we'd misused the API, and it traces back to something Laya's own card admits: these open-ended answers can latch onto the option labels in the prompt rather than the actual state being asked about. Once you measure it, the conclusion is unavoidable — the wording of a question is part of the model's configuration, and it needs the same testing and version control you'd give any other config surface.

---

## 3. Option count is the hard limit

**Host:** So that's the wording problem. Now let's talk about the other variable you flagged — the number of options the model is choosing from. You said financial sentiment is basically the poster child for these decision tiers. Does it actually hold up?

**Guest:** It does, genuinely. Three-way sentiment ships with a reasonable calibration, ECE around 0.059, a little underconfident in the middle but nothing alarming. And the operational test is the one that matters: we fit a threshold on one half of the data for a 10% error rate, applied it blind to the other half, and got 11% error while still keeping 61% of traffic flowing through untouched. Two-way framing as a binary choice does even better, ECE of 0.016, 6.3% error, nothing escalated at all.

**Host:** Okay, so at three options the dream works. What happens when you push it to something like Banking77, with its seventy-seven intent categories?

**Guest:** Confidence runs backwards. In the lowest stated-confidence band it claims 9% but it's actually right 23% of the time — underconfident when unsure. But in the top band it claims 96% confidence and is only right 64% of the time, and even above 0.99 it's wrong better than a quarter of the time. A single temperature fix can't repair that because it's miscalibrated in opposite directions simultaneously — we moved ECE from 0.178 to 0.177, essentially nothing. No threshold anywhere reaches a 10% error rate. So this isn't a vendor's claim you accept or reject, it's a coverage-versus-error curve you have to plot on your own traffic — at three options there's a usable point on it, at seventy-seven there just isn't one.

---

## 4. Temperature scaling isn't a fix, and the threshold is never permanent

**Host:** So temperature scaling — that's the standard patch everyone reaches for. Does it actually rescue any of this?

**Guest:** In one case, genuinely yes — the reworded version went from an ECE of 0.076 to 0.026, a real improvement. But on the broken phrasing it only dropped from 0.477 to 0.262 by teaching a coin flip to admit it's a coin flip — accuracy stayed at 52.9% the whole time. The other three cases were neutral or slightly worse, because minimizing log-likelihood isn't the same objective as making the top answer's confidence honest, and that gap is exactly what the lab's numbers expose.

**Host:** So there's no single fix you apply once and walk away from.

**Guest:** Right, there's no walking away. Wording needs an owner, tests, and review before anyone changes a prompt; and the threshold itself is just a function of a model, a phrasing, and a traffic mix — swap any one of those, even to an API-compatible competitor, and it has to be re-fit. Treat confidence as a number you measured on your own data, not one you were handed.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A live run of the measure command re-deriving results on GPU hardware, rather than just discussing the committed numbers
- A head-to-head comparison of Laya's calibration against Jev or Clef on the same human-labelled sets
- Guidance on how to apply these findings to a \`score\`-type decision question rather than \`noul\`/\`choice\`
- Discussion of how calibration changes after fine-tuning, since this lab measures the zero-shot model only
