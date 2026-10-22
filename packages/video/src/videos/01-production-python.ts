import type { VideoScript } from "./types.ts";

/**
 * Module 1 — Production Python. Every claim is drawn from
 * apps/handbook/src/content/docs/learn/modules/01-production-python.mdx and its request-lifecycle diagram.
 */
export const productionPython: VideoScript = {
  slug: "01-production-python",
  module: "01",
  plate: "PLATE 01 · PRODUCTION PYTHON",
  chapter: "Production Python",
  title: "Production Python: the event loop is a scheduler",
  youtube: {
    titleSuffix: "Production Python: the event loop is a scheduler",
    summary:
      "How to choose between asyncio, threads, processes and external workers, why one blocking call freezes a whole gateway, and the admission control, deadline, retry and draining patterns that keep it predictable under load. Module 1 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 1 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/01-production-python/",
      },
      {
        label: "Lab: Async AI Gateway",
        url: "https://handbook.vinodspattar.in/build/labs/async-ai-gateway/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "Python",
      "asyncio",
      "event loop",
      "concurrency",
      "AI gateway",
      "backpressure",
      "production engineering",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "One blocking call, every request stalls",
      narration:
        "A gateway holds a thousand concurrent connections to slow, unreliable model providers. Then one handler calls a synchronous client. It is not only that request that waits. Every other coroutine sharing the event loop freezes with it. Async did not fail here. It was asked for something it never promised. This module is about knowing exactly what it does promise.",
      map: {
        places: [
          { id: "reqA", label: ["Request A"], x: 0, y: 70, w: 240 },
          { id: "reqB", label: ["Request B"], x: 0, y: 226, w: 240 },
          { id: "reqC", label: ["Request C"], x: 0, y: 384, w: 240 },
          { id: "loop", label: ["Event loop"], x: 520, y: 226, w: 300 },
          { id: "block", label: ["Synchronous", "client call"], x: 1100, y: 70, w: 320, beat: 0 },
          { id: "provider", label: ["Slow model", "provider"], x: 1100, y: 384, w: 320, beat: 0 },
        ],
        links: [
          { from: "reqA", to: "loop", arrow: "end" },
          { from: "reqB", to: "loop", arrow: "end", beat: 1 },
          { from: "reqC", to: "loop", arrow: "end", beat: 1 },
          { from: "loop", to: "block", arrow: "end", beat: 0 },
          { from: "loop", to: "provider", arrow: "end", beat: 0 },
        ],
      },
      runs: [
        {
          beat: 0,
          paths: [["reqA", "loop", "block"]],
          results: ["stall"],
          marks: ["loop blocked"],
        },
        {
          beat: 1,
          paths: [
            ["reqB", "loop"],
            ["reqC", "loop"],
          ],
          results: ["stall", "stall"],
          marks: ["waiting", "waiting"],
        },
      ],
      captions: [
        "One handler calls a synchronous client inside async code.",
        "Every other coroutine on the same loop freezes with it.",
        "Async did not fail. It was asked for something it never promised.",
      ],
      beats: [
        { at: 0 },
        { at: 0.42, cue: "Every other coroutine sharing the event loop" },
        { at: 0.58, cue: "Async did not fail here" },
      ],
    },
    {
      id: "models",
      kind: "axis",
      headline: "Choose by workload, not by fashion",
      narration:
        "Choose a concurrency model by workload profile, not by which one is fashionable this year. Asyncio is for high-concurrency input and output: model APIs, databases, queues, sockets, streaming. Its catch is cooperative scheduling, so one blocking call stalls everything on the loop. Threads are for blocking libraries with no async API. Shared memory brings synchronization risk, and the global interpreter lock means no throughput gain on pure Python CPU work. Processes are for CPU-bound Python, isolation and real parallelism across cores, and they cost serialization and startup time. External workers suit durable, retryable, independently scalable tasks such as ingestion, embedding and batch inference, but add a queue and a worker fleet to operate, and are wrong for synchronous request and response paths.",
      ends: ["one process, one loop", "separate processes and fleets"],
      stations: [
        {
          name: "Asyncio",
          line: "High-concurrency I/O",
          detail: "One blocking call stalls the loop",
        },
        {
          name: "Threads",
          line: "Blocking libraries, no async API",
          detail: "No gain on pure-Python CPU work",
        },
        {
          name: "Processes",
          line: "CPU-bound work, isolation",
          detail: "Serialization and startup cost",
        },
        {
          name: "External workers",
          line: "Durable, retryable tasks",
          detail: "A queue and a fleet to operate",
        },
      ],
      beats: [
        { at: 0.11, cue: "Asyncio is for high-concurrency" },
        { at: 0.32, cue: "Threads are for blocking libraries" },
        { at: 0.56, cue: "Processes are for" },
        { at: 0.72, cue: "External workers suit durable" },
      ],
    },
    {
      id: "scheduler",
      kind: "lanes",
      headline: "A scheduler, not a speed multiplier",
      narration:
        "Here is the idea that should drive every choice. A coroutine runs until it hits an await, then control returns to the loop so another ready task can run. Concurrency comes from overlapping waiting time across many requests. The global interpreter lock changes less than people think. While one coroutine awaits a network response, others run freely, and native extensions such as NumPy still run in parallel. The lock constrains pure Python CPU-bound parallelism, specifically. That is why CPU-heavy code inside an async handler is a central failure mode. The event loop is a scheduler, not a speed multiplier.",
      lanes: [
        {
          title: "Waiting overlaps",
          subtitle: ["An await hands control back, so other ready tasks run."],
          region: "One event loop",
          chain: ["Request A awaits", "Loop runs request B", "A resumes"],
        },
        {
          title: "CPU work inline does not",
          subtitle: ["Nothing yields, so nothing else runs."],
          region: "One event loop",
          chain: ["Handler computes", "Loop is stalled", "Everyone waits"],
          tone: "fault",
        },
      ],
      takeaway: "The event loop is a scheduler, not a speed multiplier.",
      beats: [
        { at: 0.08, cue: "A coroutine runs until it hits an await" },
        { at: 0.79, cue: "code inside an async handler" },
        { at: 0.88, cue: "The event loop is a scheduler" },
      ],
    },
    {
      id: "lifecycle",
      kind: "diagram",
      headline: "A request through the gateway",
      narration:
        "Here is the real path a request takes through the gateway, and every box is a branch in the code. A request arrives and meets the rate limiter. No tokens, and it is rejected as rate limited. Then the semaphore. If no capacity frees up within the queue-wait timeout, it is rejected as overloaded. Only now does the deadline start. The gateway selects a provider and awaits the call. On success it records the result, releases capacity and returns the response. On a connection error or a timeout, it asks whether attempts remain and the provider was not pinned. If so, jittered exponential backoff, and back to selecting a provider. If not, it records the failure, releases capacity and raises to the caller.",
      layout: "01-production-python.request-lifecycle",
      legend: [
        { kind: "place", label: "step" },
        { kind: "route", label: "path taken" },
      ],
      steps: [
        { at: 0, show: ["A", "B", "e1"], focus: ["A", "B", "e1"] },
        { at: 0.22, cue: "No tokens", show: ["R1", "e2"], focus: ["B", "R1", "e2"] },
        { at: 0.29, cue: "Then the semaphore", show: ["C", "e3"], focus: ["C", "e3"] },
        { at: 0.41, cue: "rejected as overloaded", show: ["R2", "e4"], focus: ["C", "R2", "e4"] },
        {
          at: 0.43,
          cue: "Only now does the deadline start",
          show: ["D", "e5"],
          focus: ["D", "e5"],
        },
        {
          at: 0.49,
          cue: "selects a provider",
          show: ["E", "F", "e6", "e7"],
          focus: ["E", "F", "e6", "e7"],
        },
        {
          at: 0.55,
          cue: "On success",
          show: ["G", "K", "e8", "e13"],
          focus: ["F", "G", "K", "e8", "e13"],
        },
        { at: 0.64, cue: "On a connection error", show: ["H", "e9"], focus: ["F", "H", "e9"] },
        {
          at: 0.8,
          cue: "jittered exponential backoff",
          show: ["I", "e10", "e11"],
          focus: ["H", "I", "E", "e10", "e11"],
        },
        {
          at: 0.87,
          cue: "If not, it records the failure",
          show: ["J", "R3", "e12", "e14"],
          focus: ["H", "J", "R3", "e12", "e14"],
        },
      ],
    },
    {
      id: "decisions",
      kind: "anatomy",
      headline: "Three decisions carry the load",
      narration:
        "Three decisions do the load-bearing work. First, rate limiting happens before concurrency admission, so a request rejected for quota never occupies a slot that a legitimate request needed. Second, the deadline wraps the entire retry loop, not each attempt. A caller's fifteen second budget covers every retry, otherwise three retries at fifteen seconds each could keep a request alive for forty-five seconds that no caller asked for. Conflate queue wait, per-attempt and total deadline, and a twenty second timeout quietly becomes ninety. Third, capacity is released in a finally block, so an exception, a timeout or a cancellation all still return the slot.",
      lines: [
        { text: "await self._admit()", group: "plain" },
        { text: "try:", group: "plain" },
        { text: "  async with asyncio.timeout(timeout_seconds):", group: "route" },
        { text: "    for attempt in range(1, max_attempts + 1):", group: "route" },
        { text: "      result = await provider.generate(prompt)", group: "route" },
        { text: "finally:", group: "meta" },
        { text: "  self._capacity.release()", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "One deadline for the whole operation",
          body: "It covers every retry, so the caller's budget is the real budget.",
        },
        {
          group: "meta",
          title: "Always give the slot back",
          body: "Exceptions, timeouts and cancellation all still release capacity.",
        },
      ],
      beats: [
        { at: 0.26, cue: "Second, the deadline wraps" },
        { at: 0.78, cue: "Third, capacity is released" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where it breaks",
      narration:
        "Five failure modes. Blocking the event loop: a synchronous client or a CPU-heavy parsing loop inside an async function freezes every coroutine, so blocking work belongs in a thread pool executor or a separate process. Unbounded fan-out: gather over an unbounded list can exhaust connections, provider quotas and memory in one call. Retry storms: immediate, synchronized retries amplify an outage, which is why the gateway adds jitter and a circuit breaker. Leaked resources: a semaphore acquire without a release on every exit path exhausts connections, often hours after the leak shipped. And hidden queueing. Wall-clock latency cannot tell a system stuck waiting for slots from one that is slow, so measure queue wait separately, and watch p99, because a healthy p50 hides the requests that are timing out.",
      map: {
        places: [
          { id: "queue", label: ["Queue wait"], x: 0, y: 226, w: 250 },
          { id: "slot", label: ["Capacity slot"], x: 369, y: 226, w: 250 },
          { id: "loop", label: ["Event loop"], x: 738, y: 226, w: 250 },
          { id: "fan", label: ["Fan-out"], x: 1107, y: 226, w: 250 },
          { id: "retry", label: ["Retry loop"], x: 1476, y: 226, w: 250 },
        ],
        links: [
          { from: "queue", to: "slot", arrow: "end" },
          { from: "slot", to: "loop", arrow: "end" },
          { from: "loop", to: "fan", arrow: "end" },
          { from: "fan", to: "retry", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "loop",
          title: "Blocking the event loop",
          body: "A sync call or CPU loop in an async function freezes every coroutine.",
        },
        {
          at: "fan",
          title: "Unbounded fan-out",
          body: "gather over an unbounded list can exhaust connections, quotas and memory.",
        },
        {
          at: "retry",
          title: "Retry storms",
          body: "Synchronized retries amplify an outage. Add jitter and a circuit breaker.",
        },
        {
          at: "slot",
          title: "Leaked resources",
          body: "An acquire with no release on every exit path exhausts connections.",
        },
        {
          at: "queue",
          title: "Hidden queueing",
          body: "Measure queue wait apart from execution, and watch p99, not p50.",
        },
      ],
      beats: [
        { at: 0.02, cue: "Blocking the event loop" },
        { at: 0.27, cue: "Unbounded fan-out" },
        { at: 0.4, cue: "Retry storms" },
        { at: 0.54, cue: "Leaked resources" },
        { at: 0.68, cue: "And hidden queueing" },
      ],
    },
    {
      id: "ratelimit",
      kind: "lanes",
      headline: "In-process or distributed rate limiting",
      narration:
        "The sharpest trade-off is rate limiting. The lab's tenant rate limiter is an in-process token bucket. It is correct and fast for a single process, but wrong for many replicas, because each replica enforces the quota independently, so a tenant effectively gets the replica count times their real limit. The lab's distributed limiter, backed by Redis with an atomic refill and consume in one Lua script, fixes that, at the cost of a new dependency and a new failure mode: what happens to enforcement when Redis itself is unavailable. Neither option is strictly better. The in-process version is the right default until you have more than one replica.",
      lanes: [
        {
          title: "In-process token bucket",
          subtitle: ["Correct and fast for one process."],
          chain: ["Tenant", "Replica", "Local bucket"],
          routeLabel: "per replica, so the quota multiplies",
          tone: "fault",
        },
        {
          title: "Redis-backed limiter",
          subtitle: ["A new dependency and a new failure mode."],
          chain: ["Tenant", "Replica", "Shared limiter"],
          routeLabel: "one quota across replicas",
        },
      ],
      takeaway: "In-process is the right default until you have more than one replica.",
      beats: [
        { at: 0.06, cue: "The lab's tenant rate limiter" },
        { at: 0.44, cue: "The lab's distributed limiter" },
        { at: 0.8, cue: "Neither option is strictly better" },
      ],
    },
    {
      id: "draining",
      kind: "lanes",
      headline: "Shutting down without losing requests",
      narration:
        "Graceful shutdown is where many services that work in development fall apart. A rolling deploy sends a termination signal, and any request still in flight is killed mid-response. The lab's draining module fixes this. Every request registers as active on entry and deregisters in a finally block. On shutdown, drain flips readiness to false so the load balancer stops routing new traffic, then waits, bounded by a timeout, for the active count to reach zero. If the timeout fires first, drain returns False. That is an explicit, checkable signal that some requests were cut off, instead of a silent kill with no record of what was lost.",
      lanes: [
        {
          title: "No draining",
          subtitle: ["A rolling deploy kills requests mid-response."],
          chain: ["Termination signal", "Process exits", "In-flight requests killed"],
          routeLabel: "no record of what was lost",
          tone: "fault",
        },
        {
          title: "Draining",
          subtitle: ["Stop new traffic, wait, bounded by a timeout."],
          chain: ["Termination signal", "Readiness false", "Wait for zero active"],
          routeLabel: "finished, or an explicit False",
        },
      ],
      takeaway: "drain returns False when requests were cut off. Checkable, not silent.",
      beats: [
        { at: 0.1, cue: "A rolling deploy sends" },
        { at: 0.43, cue: "On shutdown, drain flips readiness" },
        { at: 0.73, cue: "drain returns False" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. One: the event loop is a scheduler, not a speed multiplier. Overlap waiting, and send CPU work to processes. Two: bound everything. Rate limit before the semaphore, put one deadline around the whole retry loop, and retry with jitter. Three: make failure visible. Measure queue wait and p99 separately, and drain on shutdown with a result you can check. To go further, build the Async AI Gateway lab, and add a queue-wait metric of your own. Links are in the description.",
      points: [
        {
          statement: "A scheduler, not a speed multiplier",
          support: "Overlap waiting. Send CPU-bound work to processes, never inline.",
          glyph: "loop",
        },
        {
          statement: "Bound everything",
          support: "Rate limit first, one deadline around all retries, jittered backoff.",
          glyph: "gate",
        },
        {
          statement: "Make failure visible",
          support: "Queue wait and p99 as metrics. Drain with a checkable result.",
          glyph: "tick",
        },
      ],
      footer: "Next: Module 2 asks what a timeout really tells you across a network.",
      beats: [
        { at: 0.05, cue: "the event loop is a scheduler" },
        { at: 0.27, cue: "bound everything" },
        { at: 0.49, cue: "make failure visible" },
        { at: 0.71, cue: "To go further, build" },
      ],
    },
  ],
};
