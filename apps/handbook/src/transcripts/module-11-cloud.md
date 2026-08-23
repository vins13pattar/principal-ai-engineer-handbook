### 1. Why cloud decisions are different

**Host:** Welcome back. This module is called Cloud, and the subtitle I keep coming back to is 'decisions you can't refactor away.' If you ship bad code, you fix it in the next sprint. If you bake in the wrong network topology or the wrong IAM boundary, that mistake outlives every team that inherits it.

**Guest:** Right, and that's really the whole premise. A region layout or a VPC boundary isn't a line you change later — it's the foundation everything else gets built on top of. By the time you notice it's wrong, it's already baked into every service built on top of it.

**Host:** So walk me through what we're actually covering, because I know this isn't just 'cloud is scary, be careful.'

**Guest:** Four decisions, and they all reduce to the same trade — control versus operational burden. When to pay the premium for a managed service instead of self-hosting. How VPC and IAM actually contain a breach instead of just describing good intentions. What multi-region has to mean operationally — a tested recovery time and recovery point, not just a diagram with two regions on it. And cost attribution existing before the GPU bill becomes the reason the project gets killed.

### 2. Managed vs. self-hosted, as a default

**Host:** Let's start with the first one, then, because it sounds like the simplest and it's probably the most argued-about in every planning meeting: managed versus self-hosted. Vector database, Kubernetes control plane — where do you land by default?

**Guest:** Managed, by default, until a specific measured reason says otherwise. A managed vector database or a managed control plane takes patching, high-availability maintenance, and backup mechanics off your plate entirely, and you pay a real per-unit premium for that plus less control over tuning. Self-hosting gets you full control and usually lower steady-state cost at scale, but now every operational failure mode is yours to own.

**Host:** So what actually counts as a good enough reason to flip that default — 'it feels expensive' doesn't qualify, I assume?

**Guest:** Right, it has to be measured, not felt. Cost at a scale you've actually reached, not a projection — or a tuning requirement the managed tier genuinely can't expose, something you've hit in practice, not anticipated. Absent one of those two, self-hosting is just buying yourself an operations problem you didn't need.

### 3. Network segmentation is only the first layer

**Host:** Okay, so once you've decided managed versus self-hosted, the next question is basically who can even reach the thing. Where does network segmentation come in?

**Guest:** It's the baseline layer everyone assumes is already handled and sometimes isn't. Public subnets are for load balancers and NAT gateways, the stuff that has to face the internet — everything else, your application tier, your database tier, belongs in a private subnet reachable only from inside the VPC. The concrete failure this prevents is exactly what it sounds like: a database or service that was never actually moved into a private subnet, sitting directly reachable from the internet, and nobody finds out until it gets scanned and exploited.

### 4. IAM is the real blast-radius control

**Host:** So say that database tier is safely tucked into a private subnet like you described. Are we done? Is the network boundary the thing that actually contains a breach?

**Guest:** No, and this is the part people underrate — network topology controls reachability, but IAM controls capability. If the app tier gets compromised, the question isn't whether the attacker can see other machines on the network, it's what that service's role actually permits it to do: which S3 prefix, which database table, which KMS key. That's the real blast radius.

**Host:** So it's the same idea as Module 6's tool permissions, just applied to cloud identity instead of an AI agent's toolset.

**Guest:** Exactly the same principle. A per-service role scoped to exactly what that service needs means compromising it only gets you that narrow slice. But a shared, broadly-scoped role used across many services means compromising any one of them effectively compromises all of them — the network segmentation you just built doesn't save you at that point.

### 5. IAM in code: a real least-privilege policy

**Host:** Let's make that concrete then, because 'scoped to exactly what it needs' can sound vague until you see the actual policy. Walk me through what this looks like in practice for something like a model-serving role.

**Guest:** So the policy has two statements, and that's the whole point — it grants s3 GetObject against one bucket path for model artifacts, and it grants DynamoDB GetItem and PutItem against one specific table for session state. Nothing else in the account is reachable through this role, no other bucket, no other table, no admin actions — so if this service gets compromised, the attacker inherits exactly those two narrow capabilities and nothing more. That's what containment actually looks like written down, as opposed to just asserted in an architecture review.

### 6. When IAM fails: the shared-role trap

**Host:** Okay so you just showed the narrow version done right. What does it look like when a team skips that and just reuses one role everywhere?

**Guest:** It looks convenient right up until it doesn't. Someone sets up a role with broad access once, attaches it to many services because writing scoped policies for each one is more work, and now the network segmentation you built earlier doesn't matter. If the least-secure of those services gets popped, the attacker inherits everything all of them could touch — plus, if one of those services also happens to sit in a public subnet by oversight rather than design, they didn't even need to work for that initial foothold.

### 7. RTO and RPO: recovery, not just redundancy

**Host:** Let's move to the third axis: recovery. You've got a multi-region setup in the diagram, replicated database, load balancer ready to redirect traffic. Isn't that the whole point of building it that way?

**Guest:** It's the point of the diagram, not the point of the system. What actually matters are two numbers, RTO and RPO — how long you can be down, and how much data you can afford to lose, measured in time since the last successful replication. And here's the part people skip: those numbers should come from business impact, not from whatever the architecture happens to already deliver. You don't ask the system what it can do and call that the target.

**Host:** So you set the target first, based on business impact, and then build to hit it. What's the failure mode if a team skips that and just trusts the diagram?

**Guest:** The failure mode is that a secondary region with a replicated database that's never actually been failed over to isn't a capability, it's an assumption. Replication lag might make that RPO target physically impossible, and you genuinely don't know until you've exercised the failover under realistic conditions — not a scheduled maintenance window where everyone's already watching and ready to intervene. Until then, it's a diagram, not a guarantee.

### 8. The replication mismatch that breaks RPO promises

**Host:** Let's make that concrete. Walk me through the case where a team commits to a 15-minute RTO and a 1-minute RPO for a production model-serving system — where does that actually break?

**Guest:** The RTO is often achievable. The problem is the RPO — it requires synchronous or near-synchronous replication. If the team actually built it on asynchronous replication running 10 minutes behind, no failover mechanism on earth fixes that, because the data you'd recover to is already 10 minutes stale before the failover even starts.

**Host:** So the target and the replication strategy have to be chosen together, not one after the other.

**Guest:** Exactly — sync replication can hit that tight RPO but it costs you write latency and even availability, since a write can't complete if the remote region is unreachable. Async keeps writes fast and local but caps your RPO at whatever the real-world lag turns out to be, not whatever number sounded reasonable in a planning doc — and you only find out which one you actually built during a real incident.

### 9. Proving failover actually works

**Host:** So you're saying that RTO number needs to live in code, not just in a runbook. Walk me through what that actually looks like.

**Guest:** Right, look at the FailoverController — should\_failover doesn't fire on one bad health check, it only triggers if every check inside the RTO window came back unhealthy. That's the whole point: the trigger is wired directly to the RTO you promised, not to some arbitrary retry count. And the lab makes you prove it — feed it checks spanning just under the RTO with one healthy blip in the middle, confirm it stays False, then feed it a full RTO window of nothing but failures and confirm it flips True. If you haven't written that test, you don't actually know your RTO is real, you just know it's written down somewhere.

**Host:** And that same multi-region setup you'd build for failover — you're saying it's not purely insurance, it's pulling double duty.

**Guest:** Exactly, serving users out of the nearest region cuts latency every single day, whether or not you ever failover — that's often the stronger business case than the disaster-recovery story alone. But it cuts both ways: cross-region latency is physics, so the instant a failover sends traffic to a standby region in another geography, every user routed there gets a different latency profile, not just for the incident but for as long as they stay pinned there.

### 10. Cost attribution before the GPU bill becomes a crisis

**Host:** Let's land on cost, then, because I think this is the one that sneaks up on teams. When does an unattributed cloud bill actually become a crisis?

**Guest:** The moment someone asks 'why did spend jump' and nobody can answer without a week of forensic digging. Tagging every resource by team or service, or better, putting each team in its own account or project, is what turns 'the bill went up' into 'team X's GPU usage went up, and here's why.' Without that, you can't even start optimizing, because you don't know what to optimize or who owns it.

**Host:** And that's the bridge back to Module 4's per-request cost tracking — you need attribution at the account level before that per-request number means anything organizationally.

**Guest:** Exactly, and it has to scale as more teams and more GPU-heavy workloads land in the same footprint — a tagging scheme that worked for one team erodes fast without deliberate extension. That's really the thread through all four of these decisions: managed-versus-self-hosted, blast radius, recovery, cost — none of them are diagrams you draw once. They're commitments you have to keep proving, or they quietly stop being true.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A live walkthrough of an actual multi-region failover incident with real timestamps and outcomes
- Specific cloud provider pricing comparisons for managed vs. self-hosted services
- A step-by-step tutorial for configuring VPC peering or transit gateways
