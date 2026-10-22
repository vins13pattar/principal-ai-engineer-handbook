import type { VideoScript } from "./types.ts";

/**
 * Module 2 — Distributed Systems. Every claim is drawn from
 * apps/handbook/src/content/docs/learn/modules/02-distributed-systems.mdx and its idempotent-retry sequence.
 */
export const distributedSystems: VideoScript = {
  slug: "02-distributed-systems",
  module: "02",
  plate: "PLATE 02 · DISTRIBUTED SYSTEMS",
  chapter: "Distributed Systems",
  title: "Distributed systems: a timeout does not mean failure",
  youtube: {
    titleSuffix: "Distributed systems: a timeout does not mean failure",
    summary:
      "Why a network call has a fourth outcome, how an idempotency key makes retries safe, what delivery semantics really promise, and how to choose consistency, backpressure and recovery on purpose. Module 2 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 2 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/02-distributed-systems/",
      },
      {
        label: "Lab: Durable Agent Task Engine",
        url: "https://handbook.vinodspattar.in/build/labs/durable-agent-task-engine/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "distributed systems",
      "idempotency",
      "delivery semantics",
      "backpressure",
      "consistency",
      "retries",
      "message queues",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "The task that ran twice",
      narration:
        "A worker crashes midway through a task, after the expensive work but before acknowledging the message. The queue sees no acknowledgment within its visibility timeout and redelivers the message to a different worker. Without idempotency, the task runs twice. If the task is charge a customer, that is now a visible, embarrassing bug. Nothing here is a network fault. The bug is in what the system assumed.",
      map: {
        places: [
          { id: "queue", label: ["Queue"], x: 0, y: 226, w: 240 },
          { id: "workerA", label: ["Worker A"], x: 420, y: 70, w: 280, beat: 0 },
          { id: "workerB", label: ["Worker B"], x: 420, y: 384, w: 280, beat: 1 },
          { id: "charge", label: ["Charge the", "customer"], x: 960, y: 226, w: 300, beat: 0 },
        ],
        links: [
          { from: "queue", to: "workerA", beat: 0, arrow: "end" },
          { from: "workerA", to: "charge", beat: 0, arrow: "end" },
          { from: "queue", to: "workerB", beat: 1, arrow: "end" },
          { from: "workerB", to: "charge", beat: 1, arrow: "end" },
        ],
      },
      runs: [
        { beat: 0, paths: [["queue", "workerA", "charge"]], results: ["ok"] },
        {
          beat: 1,
          paths: [["queue", "workerB", "charge"]],
          results: ["fail"],
          marks: ["charged twice"],
        },
      ],
      marks: [{ beat: 0, at: "workerA", text: "crashes before ack", tone: "fault" }],
      captions: [
        "Worker A does the work, then crashes before it acknowledges.",
        "No acknowledgment arrives, so the queue redelivers to worker B.",
        "Without idempotency, the task runs twice.",
      ],
      beats: [
        { at: 0 },
        { at: 0.22, cue: "The queue sees no acknowledgment" },
        { at: 0.47, cue: "Without idempotency, the task runs twice" },
      ],
    },
    {
      id: "ambiguity",
      kind: "axis",
      headline: "A network call has a fourth outcome",
      narration:
        "Inside one process, a call has three outcomes. It returned a value, it threw, or the process is still running. A network call has a fourth that a local call never has: you do not know which of the first three happened. The request might never have reached the server. It might have succeeded, with the response lost on the way back. Or it might still be executing right now. A junior instinct treats a timeout as probably failed, so retry. A principal engineer asks what happens to my system if that request actually succeeded and I retry anyway. If the answer is a double charge, the bug is not in the network. It is in the assumption that a timeout means failure.",
      ends: ["an outcome you can see", "an outcome you cannot see"],
      stations: [
        { name: "Returned", line: "The call gave you a value", detail: "Visible" },
        { name: "Threw", line: "The call raised an error", detail: "Visible" },
        { name: "Still running", line: "The work has not finished", detail: "Visible" },
        {
          name: "Unknown",
          line: "A network call only",
          detail: "Never arrived, reply lost, or still running",
        },
      ],
      beats: [
        { at: 0.06, cue: "It returned a value" },
        { at: 0.09, cue: "it threw" },
        { at: 0.11, cue: "the process is still running" },
        { at: 0.15, cue: "A network call has a fourth" },
      ],
    },
    {
      id: "retry",
      kind: "sequence",
      headline: "Claim the key before the work starts",
      narration:
        "Here is the fix. The client posts a task with an idempotency key. The gateway immediately tries a compare-and-swap insert of that key, marked pending, into the idempotency store. If the key already exists, pending or complete, the store returns the existing record, and the gateway answers with the cached result, or a conflict saying the task is in progress. If the key is new, it is inserted, and only then does the gateway tell the worker to execute. Now the network drops before the response reaches the gateway. The client retries with the same key. The second claim finds the key already pending. The worker's result arrives, the key is marked complete with the result stored, and the client gets its answer from the retry.",
      layout: "02-distributed-systems.idempotent-retry",
      steps: [
        { at: 0, upTo: 0 },
        { at: 0.09, cue: "The gateway immediately tries", upTo: 1 },
        { at: 0.23, cue: "If the key already exists", upTo: 4 },
        { at: 0.47, cue: "If the key is new", upTo: 7 },
        { at: 0.62, cue: "Now the network drops", upTo: 8 },
        { at: 0.69, cue: "The client retries with the same key", upTo: 9 },
        { at: 0.75, cue: "The second claim finds", upTo: 11 },
        { at: 0.81, cue: "The worker's result arrives", upTo: 13 },
        { at: 0.92, cue: "the client gets its answer", upTo: 15 },
      ],
    },
    {
      id: "claim",
      kind: "anatomy",
      headline: "The whole pattern lives in claim",
      narration:
        "The whole pattern lives in one method, shown here as an illustrative reference store. Claim checks and inserts inside the same lock, so two concurrent calls with the same key can never both see not found. That is why the insert happens before the task executes. If it happened after, two concurrent retries could both pass the check and both execute. One warning. An in-process lock and dictionary vanish when the process restarts, which defeats a store whose whole job is surviving failures. A real deployment needs the claim to be atomic and durable: a Redis set if not exists, or a unique constraint in a relational database.",
      lines: [
        { text: "async def claim(self, key):", group: "plain" },
        { text: "  async with self._lock:", group: "route" },
        { text: "    existing = self._records.get(key)", group: "route" },
        { text: "    if existing is not None: return existing", group: "route" },
        { text: "    self._records[key] = TaskRecord(PENDING)", group: "route" },
        { text: "    return None", group: "route" },
        { text: "", group: "plain" },
        { text: "# real store: Redis SET NX, or a unique constraint", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "Check and insert are one step",
          body: "Two concurrent calls with the same key can never both see not found.",
        },
        {
          group: "meta",
          title: "Atomic is not enough",
          body: "An in-process lock dies with the process. A real claim must also be durable.",
        },
      ],
      beats: [
        { at: 0.12, cue: "Claim checks and inserts" },
        { at: 0.54, cue: "One warning" },
      ],
    },
    {
      id: "delivery",
      kind: "lanes",
      headline: "Delivery semantics are a contract",
      narration:
        "Delivery semantics are an application contract, not a queue feature. No message queue delivers exactly once for free, whatever the marketing implies. At-most-once means a message might be lost but is never duplicated. It is cheap, but it silently drops work on failure. At-least-once means a message might be delivered more than once but is never lost. It is the practical default for anything durable, but it pushes deduplication onto the consumer. Effectively-once is at-least-once delivery plus idempotent processing at the consumer, and it is the only version of exactly once that holds up under real network partitions.",
      lanes: [
        {
          title: "At-most-once",
          subtitle: ["Cheap. Silently drops work on failure."],
          chain: ["Send", "Maybe lost", "Never duplicated"],
          tone: "fault",
        },
        {
          title: "At-least-once",
          subtitle: ["The practical default for anything durable."],
          chain: ["Send", "Redeliver until acked", "Consumer deduplicates"],
        },
        {
          title: "Effectively-once",
          subtitle: ["The version that holds up under partitions."],
          chain: ["At-least-once delivery", "Idempotent consumer", "Same effect as once"],
        },
      ],
      takeaway: "An application contract, not a queue feature.",
      beats: [
        { at: 0.2, cue: "At-most-once means" },
        { at: 0.41, cue: "At-least-once means" },
        { at: 0.7, cue: "Effectively-once is" },
        { at: 0.85, cue: "the only version of exactly once" },
      ],
    },
    {
      id: "consistency",
      kind: "lanes",
      headline: "Consistency is chosen per invariant",
      narration:
        "Consistency is chosen per invariant, not globally. Should this system be strongly or eventually consistent is the wrong question, because a payment ledger and a search index in the same system need different answers. Strong consistency, where every reader sees the latest write, is worth its coordination cost for account balances or resource ownership, where being wrong is expensive. Eventual consistency is enough, and much cheaper, for search indexes or activity feeds, where staleness is a minor user experience issue. The partition choice works the same way, per operation. A payment debit rejects rather than risk double spending. Showing cached recommendations stays available, because stale is fine and unavailable is not.",
      lanes: [
        {
          title: "Payment debit",
          subtitle: ["Strong consistency. Reject rather than risk double spending."],
          chain: ["Debit", "Confirmed by enough replicas", "Or rejected"],
        },
        {
          title: "Cached recommendations",
          subtitle: ["Eventual consistency. Stale is fine, unavailable is not."],
          chain: ["Read", "Cached copy", "Possibly stale"],
        },
      ],
      takeaway: "Decide per invariant, and per operation.",
      beats: [
        { at: 0.29, cue: "Strong consistency, where every reader" },
        { at: 0.52, cue: "Eventual consistency is enough" },
        { at: 0.7, cue: "The partition choice works the same way" },
      ],
    },
    {
      id: "pressure",
      kind: "axis",
      headline: "Four options, and an unbounded queue is not one",
      narration:
        "When a consumer falls behind a producer, there are exactly four options. Block the producer. Shed load, by dropping or rejecting new work. Buffer within a bounded limit. Or degrade service quality. An unbounded queue is not a fifth option. It is the same failure deferred, arriving later as an out-of-memory crash instead of a clean, immediate rejection. Recovery has requirements too: durable state that survives the crash, a defined replay boundary, idempotent handlers so replayed work does not execute twice, and operator-visible progress, so a human can tell recovery is happening and how far along it is.",
      ends: ["push back on the producer", "absorb it downstream"],
      stations: [
        {
          name: "Block",
          line: "Make the producer wait",
          detail: "Backpressure reaches the source",
        },
        {
          name: "Shed load",
          line: "Drop or reject new work",
          detail: "A clean, immediate rejection",
        },
        { name: "Buffer", line: "Within a bounded limit", detail: "Never unbounded" },
        { name: "Degrade", line: "Lower the service quality", detail: "Keep answering, with less" },
      ],
      beats: [
        { at: 0.11, cue: "Block the producer" },
        { at: 0.14, cue: "Shed load, by dropping" },
        { at: 0.22, cue: "Buffer within a bounded limit" },
        { at: 0.26, cue: "Or degrade service quality" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where it breaks",
      narration:
        "Five failure modes. Retry storms: if every client retries on the same schedule, the recovered dependency is hit with a synchronized spike the moment it comes back. Split brain: two nodes both believe they own a resource, usually after a partition heals ambiguously. Fencing tokens prevent it, not just electing a new leader. Unbounded queues: the failure is deferred from a clean rejection to a later, messier crash. Silent data loss from at-most-once assumptions: no error, no log line, just missing work that nobody notices until a downstream report does not add up. And cascading failures without bulkheads. One slow dependency exhausts a shared pool that healthy requests also need, and separate pools per dependency contain the blast radius.",
      map: {
        places: [
          { id: "clients", label: ["Clients"], x: 0, y: 226, w: 250 },
          { id: "queue", label: ["Queue"], x: 369, y: 226, w: 250 },
          { id: "consumers", label: ["Consumers"], x: 738, y: 226, w: 250 },
          { id: "pool", label: ["Shared pool"], x: 1107, y: 226, w: 250 },
          { id: "owner", label: ["Resource owner"], x: 1476, y: 226, w: 250 },
        ],
        links: [
          { from: "clients", to: "queue", arrow: "end" },
          { from: "queue", to: "consumers", arrow: "end" },
          { from: "consumers", to: "pool", arrow: "end" },
          { from: "pool", to: "owner", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "clients",
          title: "Retry storms",
          body: "Everyone retries on the same schedule and spikes the recovered dependency.",
        },
        {
          at: "owner",
          title: "Split brain",
          body: "Two owners after a partition. Prevent it with fencing tokens.",
        },
        {
          at: "queue",
          title: "Unbounded queues",
          body: "A clean rejection becomes a later, messier crash.",
        },
        {
          at: "consumers",
          title: "Silent data loss",
          body: "At-most-once assumptions drop work with no error and no log line.",
        },
        {
          at: "pool",
          title: "No bulkheads",
          body: "One slow dependency drains a pool that healthy requests need.",
        },
      ],
      beats: [
        { at: 0.02, cue: "Retry storms" },
        { at: 0.21, cue: "Split brain" },
        { at: 0.42, cue: "Unbounded queues" },
        { at: 0.55, cue: "Silent data loss from" },
        { at: 0.77, cue: "And cascading failures without bulkheads" },
      ],
    },
    {
      id: "tradeoffs",
      kind: "lanes",
      headline: "Synchronous or asynchronous",
      narration:
        "Two trade-offs to decide on purpose. Synchronous calls give an immediate answer and a simple mental model, but couple the caller's availability to the callee's. Asynchronous messaging decouples them, so the caller can proceed even if the consumer is down, at the cost of a harder debugging story, where is my message right now, and the recovery machinery this module covers. Within messaging, a Kafka-style log gives cheap replay and strict per-partition ordering, but consumers manage their own offsets. A RabbitMQ-style queue gives flexible routing and simple acknowledgment, but a message is gone once acked. Use synchronous for anything the caller needs an answer to now.",
      lanes: [
        {
          title: "Synchronous call",
          subtitle: ["An immediate answer, and the caller's availability depends on the callee's."],
          chain: ["Caller", "Callee", "Answer now"],
        },
        {
          title: "Asynchronous messaging",
          subtitle: [
            "Decoupled, but harder to debug.",
            "Log: cheap replay. Queue: flexible routing, no replay.",
          ],
          chain: ["Caller", "Log or queue", "Consumer later"],
        },
      ],
      takeaway: "Synchronous when the caller needs the answer now.",
      beats: [
        { at: 0.06, cue: "Synchronous calls give an immediate answer" },
        { at: 0.23, cue: "Asynchronous messaging decouples them" },
        { at: 0.88, cue: "Use synchronous for anything" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. One: a timeout is ambiguous, so design every retry assuming the first attempt may have succeeded. Two: claim the idempotency key atomically, and durably, before the work starts. Three: name the contract. At-least-once delivery with idempotent handlers, bounded queues, and consistency chosen per invariant. To go further, build the Durable Agent Task Engine lab, which implements idempotent submission, leases, dead-lettering and checkpointed resumption. Links are in the description.",
      points: [
        {
          statement: "A timeout is ambiguous",
          support: "Assume the first attempt may have succeeded before you retry.",
          glyph: "split",
        },
        {
          statement: "Claim the key before the work",
          support: "Atomic and durable, so a retry returns the original result.",
          glyph: "gate",
        },
        {
          statement: "Name the contract",
          support:
            "At-least-once with idempotent handlers, bounded queues, per-invariant consistency.",
          glyph: "chain",
        },
      ],
      footer: "Next: Module 3 follows a streamed response across the network.",
      beats: [
        { at: 0.06, cue: "a timeout is ambiguous" },
        { at: 0.26, cue: "claim the idempotency key" },
        { at: 0.42, cue: "name the contract" },
        { at: 0.68, cue: "build the Durable Agent Task Engine lab" },
      ],
    },
  ],
};
