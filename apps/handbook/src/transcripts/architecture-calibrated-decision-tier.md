### 1. The bounded question nobody should pay generation prices for

**Host:** So here's the thing that bugs me about most AI spend: a huge chunk of what gets sent to a model isn't really generation at all. It's a bounded question — which queue does this go to, is this request in scope, is this safe to act on — and you're paying generation's latency and price for what is basically a classification call, then parsing text back into an answer anyway.

**Guest:** Right, and a decision model skips that whole charade — it answers the bounded question directly from a set you define, and gives you a probability over those answers instead of prose to parse. That probability is the entire design: act on the confident ones, escalate the rest, and the expensive model only ever sees traffic that actually needs it. The catch is the architecture only works as well as that probability is honest, and the backing lab found two silent ways it stops being honest.

### 2. What the tier has to guarantee, and the limits it can't negotiate

**Host:** Okay, before we get to the two silent failures, I want to pin down what this tier actually has to promise. What does the backing lab say it's on the hook for?

**Guest:** Four things. It has to be cheaper and faster than the LLM without getting worse on the answers it keeps, it has to escalate the rest at a known, agreed error rate, it has to detect when the probability stops meaning what it meant when you set the threshold, and the wording of the question itself has to be reviewed and versioned like any other config, not just a string someone typed once.

**Host:** That last one feels easy to skip past. So what can't you negotiate on to hit those four — where does the lab say people get burned trying to cut corners?

**Guest:** Three hard constraints. The threshold is fitted, not chosen — it's a function of the model, the wording, the option count, and the traffic, so changing any one of those silently changes your error rate without an alarm going off. Calibration has to be measured on your own labelled traffic, because vendor accuracy numbers, even the most cited one, are labelled by LLM consensus, so they measure agreement with other LLMs, not correctness. And option count is a hard ceiling, not a dial — in their tests three options supported a threshold that held up on held-out data, seventy-seven didn't support one at all.

### 3. Rules, model, LLM: the request flow and the monitor that keeps it honest

**Host:** So walk me through what actually happens to a request once it hits the system. You said rules, then the decision model, then escalation — what's that path look like in practice?

**Guest:** Every request goes to the cheapest tier that can honestly decide it. Rules grab the certain cases first, no probability needed. What's left goes to the decision model, but it only keeps an answer if its top probability clears that fitted threshold — anything below gets punted to an LLM or a human, and those escalated outcomes get fed back in as labels too.

**Host:** And that feedback loop is the re-fitting monitor you mentioned — it's not a nice-to-have bolted on afterward, it's load-bearing.

**Guest:** Exactly, because the threshold was fitted on a snapshot of traffic, and traffic drifts. Without the monitor watching whether stated confidence still matches actual accuracy, you've just got a number that was correct once and nobody's checking if it still is.

### 4. Three ways the probability lies without raising an alarm

**Host:** So walk me through what actually broke in the lab, because 'the monitor wasn't watching' is still pretty abstract. Give me the first concrete failure.

**Guest:** Take the question 'Is this product review positive?' On a thousand labelled reviews it scored 52.9% — basically a coin flip, the majority baseline — and 998 of those answers were stated at 100% confidence. Just rephrase it to 'Does the reviewer like the product?' and the same rows jump to 91.2%. A tier built on the first wording keeps every answer because every answer clears threshold, nothing escalates, nothing looks broken — it's just quietly wrong.

**Host:** That's one wording landmine. What's the second failure, the one with the 77 options?

**Guest:** At 77 intent options, answers stated at 96% confidence were right only 64% of the time, while answers stated at 9% were right 23% — the signal is miscalibrated in both directions at once, so no single threshold gets error below 10%, and one temperature fix can't repair it since it moves every probability the same way. The fix is structural: split into a coarse choice then a fine one within the group. And the third failure is a vendor swap behind an API-compatible endpoint — same URL pattern, different model's probabilities — so your fitted threshold is now operating on numbers it was never calibrated against, and a falling escalation rate in that moment could mean the system got better or went blind, and nothing short of labelled samples of what it kept tells you which.

### 5. The trade-off curve: coverage, error, and what it actually costs

**Host:** So once you've split a huge option set into coarse-then-fine, how do you actually pick where the threshold sits? Is there a correct number you're aiming for?

**Guest:** There isn't one correct number, there's a curve: on three-way financial sentiment our fitted threshold kept 61% of traffic at 11% error on held-out data, and pushing it higher keeps less traffic but errs less — which side of that line you want is a business call about what a wrong kept answer costs you versus what an escalation costs, not a default anyone can hand you. That's also why the split pays for itself: one 77-way question is one call and a probability that means nothing, while coarse-then-fine is two calls and two probabilities that each have a real chance of being calibrated, and the extra call is cheap compared to a threshold you can't fit at all. But remember the tier only saves money on the 61% it actually keeps — the other 39% still pay for both the decision model and the LLM, so the decision call has to stay cheap, and as you scale, what strains isn't compute, since a median 44 ms call barely moves, it's keeping the labelled outcomes fresh enough for the monitor to trust that 61% number.

**Host:** So the fleet is the easy part and the labelling budget is the thing you actually have to plan for before you commit to a coverage target.

### 6. When the decision model is a guardrail, it's also an attack surface

**Host:** Okay, before we leave the budget conversation entirely, I want to flag something that changes the math again: when this decision tier is acting as a guardrail, isn't it also just... a target? Like, if the probability is the thing standing between a harmful request and approval, someone's going to try to game that probability.

**Guest:** Exactly right, and it's worth naming explicitly: a decision model used as a guardrail is an attack surface with a probability attached. Crafted inputs that push a harmful request just over the threshold are the decision-tier equivalent of prompt injection, and the only way you fail closed is if the tier escalates rather than approves — which means guardrail deployments want a deliberately high threshold and a slow path that's genuinely independent. And the question wording itself is configuration an attacker would love to quietly edit, so it needs the exact same change control as the policy it's encoding.

### 7. Watching it and shipping it: the observability signals and the deployment checklist

**Host:** So given that an attacker or just ordinary drift can shift the threshold's meaning without tripping anything, what actually needs to be on a dashboard for this to be trustworthy day to day? Walk me through what you're watching once it's live.

**Guest:** Every single decision gets logged with its probability, which wording version produced it, and which model revision scored it — that triple is non-negotiable because without it you can't even ask when something changed. Then you track escalation rate over time and alert on movement in either direction, since a drop looks like success but can mean the model quietly got overconfident. Alongside that you keep pulling labelled samples continuously, not just at launch, and bin stated confidence against actual accuracy — ECE gives you the headline number, but the bins are where you catch a one-sided or inverted miscalibration hiding behind a fine average. And you watch realised error on the answers you kept, measured against the exact target the threshold was fitted for, because that's the number that tells you whether the guarantee is still true.

**Host:** And that logging discipline is really what turns wording changes, threshold updates, and model swaps into reviewed events instead of silent config edits — the same care you'd give the policy itself. So if someone's building this tomorrow, that's the checklist: evaluate the wording against alternatives, fit the threshold on one labelled set and check it on a held-out one, write down the target error and the cost of escalation and own it, keep sampling kept answers forever, re-fit on a schedule and on any change, and treat even an API-compatible model swap as a re-fit rather than a shrug. Get that right and the probability actually means what it claims to — which was the whole point. Thanks for walking through all of this.

**Guest:** Thanks for having me — and that last point is the one worth remembering above all: a calibrated decision tier isn't a model you deploy once, it's a claim you keep re-earning every time anything underneath it moves.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A live walkthrough of actually fitting a threshold on a specific company's traffic
- A head-to-head cost comparison across Jev, Laya, Decisions API, and Clef pricing for this architecture specifically
