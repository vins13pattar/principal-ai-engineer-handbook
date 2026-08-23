# AWS: The Decisions That Actually Cost You

_AWS's catalog is enormous, but almost everything reduces to a handful of decisions about where data sits, who holds credentials, and which compute model you pick — and each of those has a gotcha that surfaces as a surprise bill or a surprise outage._

- **Source:** [reference:aws](/reference/lookups/aws/)
- **Runtime:** 5:28 · 15 turns · 4 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. Data has gravity, and the bill proves it

**Host:** AWS has a large catalog of services, which sounds terrifying until you realize almost all the money and the outages trace back to maybe four or five decisions. So we're going to spend this episode on those decisions instead of the catalog. And the first one is the most boring-sounding and the most expensive: how data moves, and what AWS charges you for that movement.

**Guest:** Right, and the fact that makes everything else make sense is this: bringing data into a region is basically free, but sending it out is billed, per gigabyte, whether that's to the internet or to another region entirely. So the economic gravity of the whole platform pulls compute toward wherever the data already lives, not the other way around. People design it backwards all the time and then wonder why their bill has a weird shape.

**Host:** And it's not just the big obvious egress line item, right — there are these quieter charges that sneak up on people.

**Guest:** Exactly, two in particular. Cross-AZ traffic is billed in both directions, so spreading a chatty service across availability zones for resilience means it pays, continuously, just for talking to itself. And a NAT gateway charges hourly plus per gigabyte, so a private subnet quietly pulling large model weights through it becomes a recurring surprise line on the bill that nobody notices until finance asks about it.

---

## 2. Durability is not availability — and deletion isn't either

**Host:** So let's talk about that eleven-nines number everyone loves to quote for S3. People treat it like a promise that the service will always be there when they ask for it, but that's not actually what it's promising, is it?

**Guest:** Right, it's a durability guarantee, not an availability one. Eleven nines means the odds of S3 losing an object you stored are vanishingly small, but it says nothing about whether a GET request succeeds. You can have a service that will essentially never lose your data and still returns errors often enough to break an app that assumed it was always reachable, so you still need retries and graceful degradation as if the thing could hiccup, because it can.

**Host:** And there's a second way S3 looks safer than it is, tied to deletion instead of availability. If someone deletes a versioned bucket thinking they've cleaned it up, what's actually still sitting there costing money?

**Guest:** Deleting the bucket, or even deleting the objects in it, doesn't remove the old versions if versioning was on, and it doesn't clean up incomplete multipart uploads either. Those keep accruing storage charges indefinitely until a lifecycle rule explicitly expires them, so a team can delete something months ago and still find it on the bill today. The fix is boring but non-optional: set lifecycle rules for noncurrent versions and incomplete uploads so they actually get removed instead of accruing forever.

---

## 3. Identity is the real perimeter

**Host:** Let's shift from storage to something that bites people even harder: identity. What's the single most common credential mistake you see teams make?

**Guest:** Long-lived access keys. Someone creates an IAM user, generates a key pair, drops it in a config file or an environment variable, and now that credential works forever unless someone remembers to rotate it. Roles solve this by design — a role is assumed temporarily and issues short-lived credentials that expire, so even if one leaks, the exposure window is much smaller.

**Host:** So how does a workload actually get one of those roles without someone hand-typing a secret onto a server?

**Guest:** That's instance profiles on EC2 and IRSA on Kubernetes — same idea, two implementations. It's how a workload gets a role without a stored secret. And underneath all of it sits one rule that overrides everything else: an explicit deny always wins, so if a permission you granted still fails, the answer is almost always a deny sitting in a service control policy or a permissions boundary somewhere upstream.

---

## 4. Picking compute: discounts, deadlines, and quotas nobody warned you about

**Host:** So identity's sorted out, but now I actually need to pick where the thing runs. Walk me through the compute decision, because I feel like every option has a trap door.

**Guest:** It does, and they're all different shapes of trap. Spot gives you a huge discount but only about two minutes of warning before eviction — great for batch jobs, terrible if it's holding a live request. Lambda caps out at fifteen minutes and cold starts blow up with package size, so it quietly rules itself out for most inference and all training. Reserved capacity or a Savings Plan gets you a discount for locking in a commitment, which is fine until your workload shape changes and you're paying for flexibility you don't have. And if you're doing anything with GPUs, new accounts start at zero quota — you can't even launch the instance until AWS approves an increase, and that's a lead-time problem, not a technical one.

**Host:** So the pattern across this whole episode really is the same thing over and over: nothing fails because the service is broken, it fails because nobody read the fine print on where data sits, who holds the keys, or which compute model quietly has a ceiling. That's a solid map to carry into any of these decisions.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- Whether AWS's actual per-service pricing has changed recently is not covered by these excerpts.
- A step-by-step walkthrough of setting up a VPC endpoint or IRSA is not detailed here, only that they exist and why they matter.
