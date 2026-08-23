# Raft: Consensus You Can Actually Reason About

_Raft trades throughput and multi-region flexibility for an understandable, provably-safe way to keep a replicated log consistent — and knowing exactly where that trade bites is what separates a textbook answer from a production one._

- **Source:** [reference:raft](/reference/lookups/raft/)
- **Runtime:** 5:05 · 12 turns · 3 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. One Leader, One Log

**Host:** So let's start with the shape of the problem. You've got a replicated log, a bunch of nodes, and everyone needs to agree on the same sequence of writes even when machines crash or the network hiccups. Paxos technically solves this, but it's notorious for being nearly impossible to reason about in practice. Raft showed up specifically to fix that understandability problem, right?

**Guest:** Exactly, that was the whole design goal — not new capability, just the same guarantees as Paxos but with a mental model humans can actually hold in their heads. And it worked well enough that it's now sitting underneath etcd, Consul, TiKV, CockroachDB, which means it's quietly running underneath Kubernetes itself. The core trick is brutally simple: elect one leader, and every write in the entire cluster routes through that single node.

**Host:** One leader, one log — so walk me through the roles. You've got leader, follower, candidate, and this idea of terms that keep everyone from talking over each other.

**Guest:** Right, followers just sit passively accepting AppendEntries — which doubles as both replication and a heartbeat — until their election timer fires, at which point they become a candidate and request votes for a new term. Terms are the key safety valve: it's a monotonically increasing epoch number, and any message carrying a higher term forces whoever's holding old authority to step down immediately, so you can never have two leaders both thinking they're in charge for the same term. And that single-leader-per-term design is exactly why Raft is unapologetically CP — if a minority partition gets cut off, it simply stops accepting writes rather than risk two sides of a split diverging.

---

## 2. The Numbers That Make It Safe

**Host:** Okay, let's get concrete then, because 'majority' sounds simple until you're staring at a cluster-sizing decision. Why does everyone land on three or five nodes instead of, say, four or six?

**Guest:** It comes down to quorum math: you need floor of N over 2 plus 1 nodes to agree, which means failures tolerated is floor of N minus 1 over 2. Run that formula and four nodes only tolerate one failure, exactly the same as three, but every write now has to wait on one more replica. Five gets you to tolerating two failures, so odd sizes are the sweet spot — you're paying for redundancy you actually get, not padding your latency for nothing.

**Host:** And that randomized election timeout — walk me through why that specific trick, the 150 to 300 millisecond window, actually matters instead of just picking a fixed number.

**Guest:** If every follower waited the exact same fixed interval, they'd all time out simultaneously, all become candidates at once, split the vote, and do it again forever — that's the classic livelock. Randomizing means one node almost always fires first, grabs votes before anyone else wakes up, and the heartbeat interval sits a full order of magnitude below that timeout, so a healthy leader never gets second-guessed. It all rests on one inequality: broadcast time has to be much less than election timeout, which has to be much less than mean time between failures — break the left side and you get endless elections.

---

## 3. Where It Bites You in Production

**Host:** So the theory is solid, the arithmetic checks out — where does this actually go wrong for someone running it in production?

**Guest:** A few classic traps. First, Raft doesn't scale throughput, it just gives you safety — every write still funnels through one leader, so if you need more capacity you shard into multiple Raft groups rather than expecting one group to get faster. Second, follower reads can be stale, because a follower doesn't necessarily know the latest entry is committed, so strong reads need to go through the leader with a lease or a ReadIndex check. And there's a subtler trap: committed isn't applied — an entry can be durable on a majority but a client only sees its effect once the state machine actually processes it.

**Host:** And I'd guess geography and membership changes are where people really get burned?

**Guest:** Exactly — stretch a Raft group across regions and cross-region round trips start approaching your election timeout, so you get leaders flapping in and out for no real reason; keep the group in one region and replicate across regions some other way. Membership changes are the other landmine — add or remove several nodes at once and you can briefly create two disjoint majorities, so you always change membership one node at a time. Zooming out, this is all just Raft picking consistency over availability during a partition, the CP side of CAP — if you want the deeper reasoning on that tradeoff, or the original Raft paper, or how etcd's timing constraints shape Kubernetes control-plane topology, those are all worth reading next.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A detailed side-by-side comparison of Raft's mechanics against Paxos
- Byzantine fault-tolerant consensus variants
- Concrete multi-region Raft deployment topologies beyond 'keep it in one region'
- Real-world etcd/Consul/CockroachDB internals beyond the fact that they use Raft
