### 1. A log, not a queue

**Host:** So everyone calls Kafka a message queue, but that's actually the wrong mental model, and I think it's the source of most of the confusion people have. The real picture is a log — an append-only log, like a ledger that just keeps growing. Today we're going to build up from that one idea and see how it explains basically everything Kafka does, both the good and the painful parts.

**Guest:** Right, and the detail that makes it a log instead of a queue is what happens after you read a message: nothing. A traditional queue deletes or hides a message once it's consumed, but Kafka just retains it by time or by size, so the data sits there and multiple readers can come along later and replay it. To talk about this precisely we need a little vocabulary — a topic is a named log split into partitions, a partition is the actual unit of ordering and storage, each message gets a monotonically increasing offset that the consumer itself tracks, and a consumer group is just a set of consumers sharing that work. Everything else we discuss today is really just consequences of that one design choice.

### 2. The guarantee everyone misquotes

**Host:** So let's hit the phrase people get wrong constantly: 'Kafka guarantees ordering.' What's the actual scope of that promise?

**Guest:** It's per partition, full stop, never across a topic. If you want all events for a given user or order in order, that entity's key has to hash to the same single partition every time, otherwise the messages just interleave across partitions with no relationship to each other. And this bites you in a second way: partition count is also your parallelism ceiling, since only one consumer in a group can read a given partition at a time — add more consumers than partitions and the extras just sit idle. Worse, you can't shrink partitions once created, and increasing them rehashes existing keys to new partitions, silently breaking that ordering guarantee you built your whole design around, so you really want to size that number up front.

**Host:** And what happens to the consumer that just can't keep up with that pace — does Kafka cut it some slack?

**Guest:** No slack at all — retention is storage-bound, not consumption-bound, so a slow consumer falling behind past that window, commonly seven days, doesn't pause the clock. The records just age out and get deleted, and when that consumer finally catches up it resumes at the earliest offset still available, silently skipping everything that expired in between. No error, no warning, just a gap in your data that you'll only notice later, which is why watching consumer lag — in time, not just message count — actually matters.

### 3. Durability knobs and the exactly-once myth

**Host:** Okay, so gaps from lag aside — how do you actually control durability on the write side? What's the knob that decides whether a write survives a broker dying?

**Guest:** It's acks, and it's more subtle than people think. Acks equals zero is fire and forget, acks equals one means the leader wrote it locally and told you success — but if that leader dies before replicating, the write is just gone despite the happy response you got. Acks equals all plus min insync replicas is the real contract: the write only succeeds once enough in-sync replicas, the ISR, have it, so a single dead broker can't erase it.

**Host:** So that's durability solved — but then people say Kafka does exactly-once, and you're telling me before we started recording that's the phrase you want to puncture.

**Guest:** Because it's true only inside a narrow box: transactions give you exactly-once for Kafka-to-Kafka work, atomically writing to partitions and committing offsets together. The moment you touch anything external — a database row, an API call, an email — you're back to at-least-once, full stop. So the handler on that side effect still has to be idempotent; delivery semantics aren't a feature the queue hands you, they're a contract your application has to uphold.

### 4. When to reach for Kafka — and where to go next

**Host:** So let's land the plane — if I'm staring at a whiteboard deciding between Kafka and something like RabbitMQ, what's the one question I ask myself?

**Guest:** That's really the one question — which side of that trade-off you're on for this particular workload. And if you want the deeper argument on delivery guarantees and idempotency, or how this same at-least-once ceiling shows up in long-running agent work, the distributed systems module and the durable-agent-execution material walk through both — that's where I'd go next.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A narrative walkthrough of an actual production Kafka outage or incident timeline
- Kafka Streams, KSQL, or schema registry — not covered by any excerpt
- Specific broker internals like ZooKeeper vs KRaft controller architecture
