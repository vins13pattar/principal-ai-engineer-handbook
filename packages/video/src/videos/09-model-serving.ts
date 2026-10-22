import type { VideoScript } from "./types.ts";

/**
 * Module 9 — Model Serving. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/09-model-serving.mdx; the narration is the editable
 * artifact, and `at` values are fractions of a scene until narration timestamps replace them with cues.
 */
export const modelServing: VideoScript = {
  slug: "09-model-serving",
  module: "09",
  plate: "PLATE 09 · SERVING",
  chapter: "Model Serving",
  title: "Model serving: keeping a GPU busy while it decodes",
  youtube: {
    titleSuffix: "Model serving: keeping a GPU busy while it decodes",
    summary:
      "Why serving an LLM means reconciling compute-bound prefill with memory-bandwidth-bound decode: continuous batching, the KV cache and PagedAttention, quantization, parallelism, and GPU autoscaling. Module 9 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 9 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/09-model-serving/",
      },
      {
        label: "Lab: Dynamic Batching Inference",
        url: "https://handbook.vinodspattar.in/build/labs/dynamic-batching-inference/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "LLM serving",
      "continuous batching",
      "KV cache",
      "PagedAttention",
      "GPU",
      "AI infrastructure",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "A short request held hostage by a long one",
      narration:
        "Three requests share a batch. Two are short and finish quickly. One generates for a long time. Under static batching, nothing is returned until that last one finishes, so the short requests wait on a stranger's length. It shows up as unpredictable ninety-ninth percentile latency that has nothing to do with the size of your own request. The fix is not a bigger GPU. It starts with understanding what a GPU is actually doing while it generates.",
      map: {
        places: [
          { id: "short1", label: ["Short request"], x: 0, y: 70, w: 320 },
          { id: "short2", label: ["Short request"], x: 0, y: 226, w: 320 },
          { id: "long", label: ["Long generation"], x: 0, y: 384, w: 320, beat: 0 },
          { id: "batch", label: ["Static batch"], x: 560, y: 226, w: 320, beat: 0 },
          { id: "out", label: ["Results, all together"], x: 1160, y: 226, w: 440, beat: 1 },
        ],
        links: [
          { from: "short1", to: "batch", beat: 0, arrow: "end" },
          { from: "short2", to: "batch", beat: 0, arrow: "end" },
          { from: "long", to: "batch", beat: 0, arrow: "end" },
          { from: "batch", to: "out", beat: 1, arrow: "end" },
        ],
      },
      runs: [
        {
          beat: 0,
          paths: [
            ["short1", "batch"],
            ["short2", "batch"],
          ],
          results: ["ok", "ok"],
          marks: ["done early", "done early"],
        },
        {
          beat: 1,
          paths: [["long", "batch", "out"]],
          results: ["stall"],
          marks: ["everyone waits"],
        },
      ],
      captions: [
        "Two short requests finish early. One long one is still generating.",
        "Under static batching, nothing returns until the last request finishes.",
        "Unpredictable tail latency, unrelated to your own request's size.",
      ],
      beats: [
        { at: 0 },
        { at: 0.24, cue: "Under static batching" },
        { at: 0.62, cue: "The fix is not a bigger" },
      ],
    },
    {
      id: "phases",
      kind: "axis",
      headline: "Two phases, opposite bottlenecks",
      narration:
        "A request passes through two phases with opposite bottlenecks. Prefill processes the entire prompt in one forward pass. All prompt tokens are known up front, so it parallelizes across tokens and saturates GPU compute. Decode generates output one token at a time, and each token depends on the one before it, so it cannot be parallelized across the sequence. Every decode step reads the entire model's weights and the growing KV cache from GPU memory to produce a single token. So decode is bottlenecked on memory bandwidth, and most of the GPU's compute sits idle. An idle-looking GPU is still fully occupied, moving memory. The remedy is batching more requests' decode steps together.",
      ends: ["compute-bound: saturates the GPU", "memory-bandwidth-bound: compute sits idle"],
      stations: [
        {
          name: "Prefill",
          line: "The whole prompt, one pass",
          detail: "Parallel across tokens. Bounds time to first token.",
        },
        {
          name: "Decode",
          line: "One token at a time",
          detail: "Each step reads all weights and the KV cache. Bounds time per output token.",
        },
      ],
      beats: [
        { at: 0.1, cue: "Prefill processes the entire prompt" },
        { at: 0.38, cue: "Decode generates output one token" },
      ],
    },
    {
      id: "pipeline",
      kind: "diagram",
      layout: "09-model-serving.serving-pipeline",
      headline: "A scheduler that admits at every step",
      narration:
        "Here is the serving pipeline. Incoming requests reach a continuous batching scheduler. Inside one model server, the scheduler hands a request to prefill, which fills the KV cache. Decode then reads that cache and generates one token at a time, streaming tokens to the caller. Decode also feeds back to the scheduler, because admission is evaluated at every decode step. Static batching would wait for a full batch and waste any slot that finished early. Here a finished request's slot is taken immediately, so a new request joins mid-batch without waiting on anyone. When memory gets tight, the KV cache is evicted under memory pressure, and requests are preempted or rejected. Around all of it, a load balancer spreads requests across an autoscaled fleet of model server replicas.",
      legend: [
        { kind: "place", label: "stage" },
        { kind: "store", label: "KV cache" },
        { kind: "route", label: "request flow" },
        { kind: "region", label: "one server, or the fleet" },
      ],
      steps: [
        {
          at: 0,
          show: ["Req", "Sched", "e1"],
          focus: ["Req", "Sched", "e1"],
          camera: ["Req", "Sched"],
        },
        {
          at: 0.14,
          cue: "hands a request to prefill",
          show: ["GPU", "Prefill", "e2"],
          focus: ["Sched", "Prefill", "e2"],
          camera: ["Sched", "GPU"],
        },
        {
          at: 0.24,
          cue: "prefill, which fills",
          show: ["KV", "e3"],
          focus: ["Prefill", "KV", "e3"],
          camera: ["GPU"],
        },
        {
          at: 0.32,
          cue: "Decode then reads that cache",
          show: ["Decode", "e4", "Out", "e6"],
          focus: ["KV", "Decode", "Out", "e4", "e6"],
          camera: ["GPU"],
        },
        {
          at: 0.45,
          cue: "Decode also feeds back to the scheduler",
          show: ["e5"],
          focus: ["Decode", "Sched", "e5"],
          camera: ["Sched", "GPU"],
        },
        {
          at: 0.62,
          cue: "a new request joins mid-batch",
          show: ["e7"],
          focus: ["Sched", "Prefill", "e7"],
          camera: ["Sched", "GPU"],
        },
        {
          at: 0.76,
          cue: "evicted under memory pressure",
          show: ["Evict", "e8"],
          focus: ["KV", "Evict", "e8"],
          camera: ["GPU", "Evict"],
        },
        {
          at: 0.88,
          cue: "a load balancer spreads requests",
          show: ["Fleet", "LB", "e12", "e9", "GPU2", "GPUN", "e10", "e11"],
          focus: ["LB", "GPU", "GPU2", "GPUN", "e9", "e10", "e11", "e12"],
          camera: ["Req", "Fleet", "Evict"],
        },
      ],
    },
    {
      id: "kv",
      kind: "lanes",
      headline: "The KV cache caps concurrency",
      narration:
        "The KV cache deserves its own look. Attention needs each new token to attend to every previous one, so the key and value projections of earlier tokens are cached in GPU memory and reused across decode steps. The cache grows with sequence length and with the number of concurrent sequences, and it competes with the model weights for the same finite memory. Early implementations reserved one contiguous block per sequence, sized for its maximum possible length, so a short sequence still held worst-case space. PagedAttention borrows paged virtual memory from operating systems: small fixed-size blocks that need not be contiguous, found through a per-sequence block table. That essentially eliminates the fragmentation. The result is simple. KV cache capacity, not model size alone, usually caps how many requests a GPU can serve.",
      lanes: [
        {
          title: "Contiguous block",
          subtitle: ["Sized for the maximum length. A short sequence still reserves worst case."],
          chain: ["Reserve worst-case length", "Memory fragments", "Space wasted"],
          tone: "fault",
        },
        {
          title: "PagedAttention",
          subtitle: ["Borrowed from paged virtual memory in operating systems."],
          chain: ["Small fixed-size blocks", "Per-sequence block table", "More sequences fit"],
        },
      ],
      takeaway: "KV cache capacity usually caps concurrency, not model size alone.",
      beats: [
        { at: 0.42, cue: "Early implementations reserved" },
        { at: 0.6, cue: "PagedAttention borrows paged virtual memory" },
        { at: 0.84, cue: "capacity, not model size alone" },
      ],
    },
    {
      id: "quant",
      kind: "axis",
      headline: "Quantization: capacity against accuracy",
      narration:
        "Quantization trades accuracy for capacity. Storing weights, and sometimes the KV cache itself, in lower precision cuts memory footprint and memory bandwidth pressure, which speeds up the memory-bound decode phase and fits more cache in the same GPU. Take a seventy billion parameter model on a fixed GPU budget. Sixteen-bit gives the best accuracy but the fewest concurrent requests per GPU. Eight-bit integer roughly doubles concurrent capacity, for a small, usually acceptable quality loss. Four-bit pushes capacity further, but risks visible degradation on precise reasoning or exact-format outputs. The only defensible way to choose is to run your own evaluation harness at each level on representative production traffic, not to trust a vendor's aggregate benchmark.",
      ends: ["most accurate", "most concurrent capacity"],
      stations: [
        {
          name: "FP16",
          line: "Best accuracy",
          detail: "Fewest concurrent requests per GPU.",
        },
        {
          name: "INT8",
          line: "Roughly double the capacity",
          detail: "A small, usually acceptable quality loss on most tasks.",
        },
        {
          name: "INT4",
          line: "More capacity still",
          detail: "Risks visible degradation on precise reasoning or exact formats.",
        },
      ],
      beats: [
        { at: 0.4, cue: "Sixteen-bit gives the best accuracy" },
        { at: 0.54, cue: "Eight-bit integer roughly doubles" },
        { at: 0.7, cue: "Four-bit pushes capacity further" },
      ],
    },
    {
      id: "parallelism",
      kind: "axis",
      headline: "When one GPU is not enough",
      narration:
        "Some models are too large for one GPU's memory, so you split them. Tensor parallelism splits individual layers across GPUs. It lowers per-token latency, but every layer needs a synchronization step, so it demands fast interconnect. Pipeline parallelism assigns different layers to different GPUs and streams batches through them. It tolerates weaker interconnect, but pays in pipeline bubbles, idle time while later stages wait on earlier ones, unless the batch is large enough to keep every stage busy. Sharding is a separate scaling axis from replica count. Reach for it when a model does not fit on one GPU at all, not as a substitute for adding replicas once it does.",
      ends: ["needs fast interconnect", "tolerates weaker interconnect"],
      stations: [
        {
          name: "Tensor",
          line: "Splits each layer across GPUs",
          detail: "Lowers per-token latency. Pays a synchronization step on every layer.",
        },
        {
          name: "Pipeline",
          line: "Different layers on different GPUs",
          detail: "Tolerates weaker links. Needs a large batch to hide pipeline bubbles.",
        },
      ],
      beats: [
        { at: 0.14, cue: "Tensor parallelism splits individual layers" },
        { at: 0.46, cue: "Pipeline parallelism assigns different layers" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where serving breaks",
      narration:
        "Four failures to know. Head-of-line blocking: under static batching, one unusually long generation holds every other request hostage. The fix is continuous batching, not a bigger GPU. KV cache exhaustion: if admission control ignores the remaining KV cache budget, a burst of long-context requests can exceed GPU memory, forcing the server to preempt or reject in-flight requests. It looks like the server crashed, but it was a capacity planning gap. Cold-start latency: a new GPU replica must load multi-gigabyte weights before it serves a single request, which can take tens of seconds to minutes. And quantization accuracy loss going unmeasured, a silent regression on exactly the tasks a general benchmark does not cover.",
      map: {
        places: [
          { id: "batch", label: ["Static batch"], x: 0, y: 226, w: 300 },
          { id: "kv", label: ["KV cache"], x: 450, y: 226, w: 300 },
          { id: "fleet", label: ["Autoscaled fleet"], x: 900, y: 226, w: 300 },
          { id: "weights", label: ["Quantized weights"], x: 1350, y: 226, w: 340 },
        ],
        links: [
          { from: "batch", to: "kv", arrow: "end" },
          { from: "kv", to: "fleet", arrow: "end" },
          { from: "fleet", to: "weights", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "batch",
          title: "Head-of-line blocking",
          body: "One long generation holds every other request in the batch hostage.",
        },
        {
          at: "kv",
          title: "KV cache exhaustion",
          body: "A burst exceeds GPU memory. Requests are preempted or rejected. It looks like a crash.",
        },
        {
          at: "fleet",
          title: "Cold-start latency",
          body: "A new replica loads multi-gigabyte weights first. Tens of seconds to minutes.",
        },
        {
          at: "weights",
          title: "Unmeasured quantization",
          body: "A silent regression on the tasks a general benchmark does not cover.",
        },
      ],
      beats: [
        { at: 0.08, cue: "Head-of-line blocking" },
        { at: 0.3, cue: "cache exhaustion" },
        { at: 0.56, cue: "Cold-start latency" },
        { at: 0.82, cue: "quantization accuracy loss going unmeasured" },
      ],
    },
    {
      id: "scaling",
      kind: "lanes",
      headline: "Plan for the cold start",
      narration:
        "That cold start needs a plan. Scaling reactively on current load guarantees the new replica is not ready until well after the spike that triggered it. So there are three postures. Scale from zero, and pay the cold start on the next request after an idle period. Keep a small warm pool, sized to absorb a burst while cold replicas spin up. Or scale out ahead of known traffic patterns. Warm GPUs cost money for capacity that may go unused, and scaling to zero saves money but brings the cold start back. The right point depends on how spiky real traffic is, not a default. And the load balancer should know each replica's KV cache utilization, not just round-robin.",
      lanes: [
        {
          title: "Scale from zero",
          subtitle: ["Saves cost. Brings the cold start back."],
          chain: ["Load arrives", "Provision a GPU", "Load the weights"],
          tone: "fault",
        },
        {
          title: "Keep a warm pool",
          subtitle: ["Sized to absorb a burst while cold replicas spin up."],
          chain: ["Small warm pool", "Absorbs the burst", "Cold replicas catch up"],
        },
        {
          title: "Scale ahead",
          subtitle: ["Scale out before known traffic patterns."],
          chain: ["Known pattern", "Predictive scale-out", "Ready before the spike"],
        },
      ],
      takeaway: "Where you land depends on how spiky real traffic is.",
      beats: [
        { at: 0.28, cue: "Scale from zero" },
        { at: 0.4, cue: "Keep a small warm pool" },
        { at: 0.52, cue: "Or scale out ahead" },
        { at: 0.7, cue: "The right point depends" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to take away. One: serving reconciles two workloads, compute-bound prefill and memory-bandwidth-bound decode, and continuous batching keeps the GPU busy despite decode. Two: KV cache memory, not raw compute, usually caps concurrency, so admission control and paged allocation matter. Three: measure before you ship, whether it is quantization or autoscaling, with a real evaluation harness and real traffic. To see batching as running code, build the Dynamic Batching Inference lab. Links are in the description.",
      points: [
        {
          statement: "Two phases, one scheduler",
          support:
            "Prefill is compute-bound, decode is memory-bound. Continuous batching fills the gap.",
          glyph: "split",
        },
        {
          statement: "Memory caps concurrency",
          support: "KV cache capacity, managed by admission control and paged allocation.",
          glyph: "stack",
        },
        {
          statement: "Measure before you ship",
          support: "Quantization and autoscaling both need real evaluation and real traffic.",
          glyph: "tick",
        },
      ],
      footer: "Next: build the Dynamic Batching Inference lab and read its p50, p95 and p99.",
      beats: [
        { at: 0.1, cue: "serving reconciles two workloads" },
        { at: 0.34, cue: "cache memory, not raw compute" },
        { at: 0.58, cue: "measure before you ship" },
        { at: 0.8, cue: "build the Dynamic Batching Inference lab" },
      ],
    },
  ],
};
