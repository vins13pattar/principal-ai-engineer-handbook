### 1. Not the gateway's kind of routing

**Host:** So today we're talking about model routing, but I want to be really precise about what we mean, because the word gets used for two totally different things. There's the async-ai-gateway kind of routing, which is about failover — you've got replicas of the same provider, and you route to whichever one is actually healthy right now. That's a reliability problem.

**Guest:** Right, and that's not what we're doing here. Model Router isn't asking 'which replica is up' — it's asking 'does this task even need the bigger model, or would a cheaper, faster model handle it just fine.' It's matching task difficulty to model capability and price, not swapping between equivalent things. Same word, routing, almost no shared logic — which is exactly why we keep these labs apart, so each one stays about one clean problem.

### 2. The finding: 19% more correct, 11× worse per correct

**Host:** Okay so let's get to the number that started this whole lab. You told me the first version of your test suite actually asserted the conventional wisdom — escalation saves money, keeps quality — and it failed. What did the failure look like?

**Guest:** Two hundred tasks, and we gave the policy the best possible confidence signal — low exactly when the answer is wrong, which no real system gets. Cheap-only gets 166 correct for 0.04 in total cost. Escalating gets 197 correct, but total cost jumps to 0.55. Do the division and cost per correct answer goes from 0.00024 to 0.00279 — accuracy up 19%, cost per correct answer eleven times worse.

**Host:** Eleven times worse feels like it must be about that huge price gap between the tiers though — isn't that just because the expensive model is 75 times pricier?

**Guest:** That's the natural assumption, but no — the relationship holds at 10x, 5x, even 2x. It's arithmetic, not pricing. The cheap model is already right 83% of the time, so it's throwing off a huge pile of nearly-free correct answers; escalation only adds a smaller batch of expensive correct ones on top, and averaging those together can only push the cost-per-correct number up. That's why cost per correct answer is a trap here — it's the metric everyone instinctively reaches for, and it's built to hide exactly this.

### 3. The number that actually decides, and everything else the tests won't let slide

**Host:** So if cost per correct is a trap, what's the number you'd actually put in front of someone deciding whether to escalate?

**Guest:** Marginal cost per rescued answer — escalated cost minus baseline cost, divided by escalated correct minus baseline correct. That isolates what the extra correctness actually cost you: about 0.00044 at a 2x price ratio, about 0.016 at 75x. Whether that's worth paying isn't a metrics question anymore, it's a product question — what does a wrong answer cost you — and the router is right to refuse to answer it for you.

**Host:** That's a nice hinge point. Before we close out, walk me through the rest of what's pinned down — the smaller behaviors that don't get the spotlight but still matter.

**Guest:** Capability gets filtered before cost, so the cheapest model in the fleet never gets picked for work it literally can't do just because it's cheap. If nothing clears the quality floor the router still answers, but it says so in the reason string instead of failing silently, and a budget cap raises the tier rather than quietly downgrading it without an alert. Ties break on name so runs are reproducible, and a bad confidence signal produces code that looks completely fine — same escalation, same double billing, far less benefit — which is exactly why it has to be measured rather than trusted. That leaves the real open questions for whoever owns this in production: what a wrong answer is worth, who keeps that quality number honest as it drifts, whether a model's capability claims can be trusted, and that escalation spends latency too, not just money, so a task that takes two round trips can miss a deadline the single expensive call would have met.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A concrete dollar figure for what a wrong answer costs in a real product — the excerpts raise this as the deciding question but deliberately leave it unanswered
- A worked example of the marginal-cost formula changing a real team's escalation decision end-to-end
