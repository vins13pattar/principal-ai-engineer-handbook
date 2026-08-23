# Module 9: Model Serving — Why an Idle-Looking GPU Is Still Fully Occupied

_Every serving-layer trick in this module exists to reconcile prefill's compute-bound parallelism with decode's memory-bandwidth-bound one-token-at-a-time grind — and every cost, latency, and capacity number a principal engineer has to explain traces back to that split._

- **Source:** [module:09-model-serving](/learn/modules/09-model-serving/)
- **Runtime:** 16:18 · 42 turns · 11 beats
- **Written by:** claude-sonnet-5 on 2026-08-22
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The two workloads hiding inside one request

**Host:** So we're kicking off the model serving module, and I want to start with something that trips up a lot of engineers: serving an LLM is not just 'run inference, but faster.' There are actually two completely different workloads hiding inside every single request you send to a model.

**Guest:** Right, and they pull in opposite directions. When you process the prompt — what we call prefill — every token is already known, so the GPU can chew through all of them in parallel. It's compute-bound, and it saturates the hardware beautifully. But then generation, decode, is the opposite: you're producing one token at a time, each one depending on the last, so there's no parallelism across the sequence. Every single step has to read the entire model's weights and the whole KV cache from memory just to spit out one token, so you're bottlenecked on memory bandwidth, not compute.

**Host:** Which is the counterintuitive part — a GPU that looks idle during decode isn't actually idle at all, it's fully busy just shuffling memory around for one token. And that one fact is basically the thesis for this whole module: continuous batching, KV cache tricks, quantization, parallelism strategies — every one of them exists to reconcile that split, so by the end you should be able to trace any serving cost or latency number straight back to prefill versus decode.

---

## 2. Why decode leaves the GPU idle-looking but fully busy

**Host:** Okay, so walk me through what's actually happening on the chip during one of those decode steps. Because 'idle but busy' still sounds like a contradiction to me.

**Guest:** It's not idle, it's just not computing much — it's moving data. To produce a single token, the GPU has to pull the entire model's weights plus that request's whole KV cache out of memory, and it does that same full pull for every single token you generate. That's a massive memory transfer to produce one number, so the GPU sits there saturated on bandwidth while its compute units mostly wait around with nothing to chew on.

**Host:** So the compute units are starved, not because there's no work, but because the work is dwarfed by the time spent fetching everything from memory. Which means the fix can't be a faster GPU, that memory traffic is fixed per token — the only lever is making that same expensive memory pass produce tokens for more than one request at once.

---

## 3. Static batching's hostage problem, and continuous batching's fix

**Host:** Okay, so if the fix is batching more requests into that same memory pass, why not just batch them the obvious way — collect a batch, run them all together, return results together? What breaks there?

**Guest:** Because requests don't finish at the same time. If you lock a batch together and one sequence generates a short answer while another keeps rambling on, that short one's slot just sits there burning GPU cycles doing nothing until the whole batch is done. You've paid for capacity you're not using, and worse, any new request has to wait in line for that entire batch to close out before it even starts.

**Host:** And that's the p99 killer, right — someone's simple request gets stuck behind a stranger's essay, purely by bad luck of which batch they landed in.

**Guest:** Exactly, it has nothing to do with that request's own size, which makes it maddening to debug. Continuous batching fixes it by re-checking admission at every single decode step — the moment a slot frees up, a queued request's prefill drops right in, so the batch stays full and no one's held hostage by someone else's long generation.

---

## 4. The KV cache: why memory, not model size, caps concurrency

**Host:** So once the batch is staying full, what's actually filling up the GPU's memory while all this is happening? Because I've heard people say the model weights themselves aren't usually the bottleneck.

**Guest:** Right, it's the KV cache. Every token needs to attend to all previous tokens, and recomputing those key and value projections from scratch at every single decode step would be enormously wasteful, so instead you cache them in GPU memory and just reuse them, only computing the new token's projections each step. The catch is that cache grows linearly both with sequence length and with how many sequences you're running concurrently, and it's sitting in the exact same finite GPU memory pool as the model weights.

**Host:** So concurrency is capped by whichever fills up first, and it's usually the cache, not the weights.

**Guest:** Exactly, and early implementations made it worse by allocating one contiguous block per sequence sized for the worst-case max length, so a short conversation still reserved space for its worst-case length, fragmenting memory badly. PagedAttention fixed that by borrowing the OS trick of paged virtual memory — small fixed-size blocks that don't need to be contiguous, tracked through a block table per sequence — which is why engines like vLLM can pack meaningfully more concurrent requests into the same GPU.

---

## 5. PagedAttention: borrowing an OS trick to stop wasting memory

**Host:** So walk me through the mechanics a bit more. When you say fixed-size blocks tracked through a block table, what does that actually buy you over the old contiguous approach, concretely?

**Guest:** Think of it like OS paging: instead of demanding one giant contiguous slab of memory upfront, you allocate small blocks on demand as the sequence actually grows, and a lightweight table maps logical positions in the sequence to wherever those blocks physically live. So a short conversation just uses a few blocks and stops, it never reserves space for a max-length sequence it'll never reach, and the scheduler can grab any free block anywhere in memory rather than needing one big open contiguous chunk.

**Host:** And that near-eliminates fragmentation because you're never stuck with a bunch of small unusable gaps between reservations.

**Guest:** Exactly, and the compounding effect is what matters in production: less wasted memory per sequence means more sequences' KV caches fit simultaneously, which is precisely the capacity constraint we just established as the real ceiling. That's the core mechanism behind why modern serving engines fit meaningfully more concurrent sequences in the same GPU memory, and it's a big part of why the paper that introduced it also popularized continuous batching as the default architecture for open-source LLM serving engines.

---

## 6. Inside a scheduler: reading the admission-control code

**Host:** Okay, let's make this concrete, because I think people nod along to 'admission control' without picturing what actually runs. Walk me through what happens when this scheduler's step function fires on a single tick.

**Guest:** Sure. First it looks at the queue and asks, for each waiting request in order, would admitting this one push total tokens in flight over the KV budget? If yes, it stops right there — it doesn't skip ahead to a smaller request behind it, so ordering matters. If a request fits, it moves from queue into in\_flight and that same tick it gets its one prefill pass, which just flips a flag and does nothing else that tick, before it starts decoding.

**Host:** And that's the part that surprised me — prefill is its own tick, separate from decode, even though it's the same loop. Then eviction is just as blunt: hit your max tokens, you're deleted and your budget's back on the table.

**Guest:** Right, and that delete is the whole point — it's not cleanup happening later on some GC schedule, it's synchronous, same tick, so the very next call to admit sees that freed budget immediately. That's continuous batching's mechanism laid completely bare: no tensor math, no CUDA kernels, just a budget check, a one-tick prefill, a decode increment, and an eviction — and a real engine bolts real forward passes and page-table accounting onto exactly this skeleton.

---

## 7. Quantization: the 70B decision nobody should make on vibes

**Host:** So the scheduler skeleton is bolted onto real memory now, but there's still this lever nobody wants to pull without a good reason: quantization. Walk me through what actually changes when you drop a 70B model from FP16 to INT8 or INT4.

**Guest:** Weights and often the KV cache itself get stored in fewer bits, which shrinks memory footprint and, just as importantly, the memory bandwidth you need to move those weights every decode step — that's a direct speedup, and the freed memory means more KV cache pages fit, so more concurrent sequences. FP16 gives you the best accuracy but the least capacity; INT8 roughly doubles concurrent requests for usually-small quality loss; INT4 pushes capacity further but starts risking visible degradation on tasks that need precise reasoning or exact output formats.

**Host:** That 'usually small' and 'starts risking' are doing a lot of work there — how does a team actually decide which level to ship on, instead of just trusting whatever the model vendor's benchmark card says?

**Guest:** They don't trust it, because a vendor's aggregate benchmark averages across tasks and can completely hide a regression that only shows up on tasks needing precise reasoning or exact-format outputs. The only defensible move is running the same evaluation harness from Module 4 against FP16, INT8, and INT4 on representative production requests, and comparing task-by-task, not just the aggregate score. And how much degradation is tolerable at each level isn't an engineering call at that point — it's a product decision, because it's trading measured accuracy against a very concrete, very measurable jump in concurrent-request capacity.

---

## 8. Splitting a model that doesn't fit on one GPU

**Host:** So quantization gets you more room on a single GPU, but at some point the model just doesn't fit no matter what precision you pick. Once you're literally splitting weights across GPUs, what are the actual options and how do you pick?

**Guest:** Two real answers, and they trade off differently. Tensor parallelism splits the matrix math inside each layer across GPUs, so every single layer needs a synchronization step, which means you need fast interconnect like NVLink or the communication overhead eats your latency gains alive. Pipeline parallelism instead hands whole layers to different GPUs and streams batches through like an assembly line, so it tolerates weaker interconnect, but you pay for it with bubbles — idle GPU time while later stages sit waiting on earlier ones — unless your batch is big enough to keep every stage fed.

**Host:** So it's fast-but-demanding versus tolerant-but-bubbly. Is this something you reach for instead of just adding more replicas, or alongside it?

**Guest:** Alongside, and it's a completely separate axis — that's the part people conflate. Horizontal scaling, more replicas behind a load balancer, is what you do once a model already fits on a GPU and you need more throughput. Sharding via tensor or pipeline parallelism is what you reach for only when a single model doesn't fit on one GPU at all; once it fits, you go back to adding replicas, not more shards.

---

## 9. When it breaks: capacity gaps and cold starts

**Host:** So walk me through how this actually breaks in production, because I imagine none of these failures announce themselves as capacity problems. They probably show up looking like something else entirely.

**Guest:** Exactly, and that's what makes them dangerous. If admission control isn't checking real remaining KV budget, a burst of long-context requests can blow past available memory and force preemptions or rejections mid-flight — from the outside that looks like the model server just crashed, when really it's a capacity-planning gap nobody instrumented. Separately, under static batching, one long generation holds an entire batch hostage, so requests that finished their own work seconds ago are still waiting — and that shows up as p99 latency spikes that have nothing to do with any individual request's size.

**Host:** And that second failure mode, the mystery p99 — that's exactly the kind of thing an on-call engineer would burn hours on, chasing the wrong request. What about scaling out to fix capacity, does that save you in the moment?

**Guest:** Not in the moment it's needed, no. Scaling a GPU replica from zero means loading multi-gigabyte weights onto freshly provisioned hardware, and that can take tens of seconds to minutes — an eternity against the latency budget of whatever request triggered the scale-out in the first place. That's why you don't scale reactively on current load alone; you keep a warm pool sized for burst absorption and, where you can, scale ahead of known traffic patterns predictively.

---

## 10. Multi-tenant isolation and the cost of skipping the re-eval

**Host:** Warm pools and predictive scaling handle the capacity side, but scaling out doesn't help if the fleet is shared across customers. What happens when multiple tenants are hitting the same GPUs?

**Guest:** Then isolation becomes a security property, not just a performance nicety. If one tenant sends a burst of huge prompts and there's no boundary on KV cache allocation or batch composition, that tenant can starve everyone else's latency budget without ever touching their data. In a poorly isolated implementation you can even leak timing information — the shape and duration of one tenant's requests becomes inferable by another just from watching response latencies on the shared server.

**Host:** So isolation is the last capacity-planning gap. Is there an analogous silent gap on the model side — something that looks fine operationally but quietly breaks correctness?

**Guest:** Yes, and it's the one people skip most casually: shipping a quantized or distilled model because it fits more requests per GPU, without re-running the safety evaluation harness. A general accuracy benchmark often won't catch a safety regression, so the model can look fine on your dashboards while behaving differently on exactly the inputs that matter most.

---

## 11. Taking it into your hands: the batching lab and closing synthesis

**Host:** So if someone's still not convinced that head-of-line blocking is a real cost and not just a theoretical worry, is there a way to actually see it rather than take our word for it?

**Guest:** That's exactly what the dynamic batching lab is for. You extend the continuous scheduler we've been discussing with a static one that only admits new requests once every in-flight request finishes, throw both at a mixed workload of short and long generations, and measure how long the short requests take under each. The mechanism is real production-shaped code, canary routing, promote and rollback, a full p50/p95/p99 harness, so you're not asserting the gap, you're plotting it, and watching a short request sit behind a long one for however many extra seconds is a much better teacher than any diagram.

**Host:** That feels like the right place to leave people: go quantify it yourself instead of trusting the slide. And it loops back nicely to where we started this whole episode, because every one of those interview questions we'd hand a candidate, why batch decode steps at all, why static wastes capacity, why it's KV cache memory and not compute that caps you, why tensor versus pipeline parallelism trades off interconnect for bubbles, all of it is just the prefill-is-compute-bound, decode-is-bandwidth-bound split wearing a different costume.

**Guest:** Right, that split is the one fact everything else in this module derives from, so if a candidate or a colleague can explain that clearly, they can rebuild the rest of the reasoning on the spot instead of memorizing it. That's the actual bar: not knowing the answers, but knowing why the two workloads hiding in one request force every one of those answers to be what it is.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- Specific dollar-cost or GPU-model benchmarks comparing serving engines
- Detailed methodology for what a safety evaluation harness should test on a quantized model
- Real-world outage postmortems from named companies running these serving stacks
- Performance comparisons between vLLM, TensorRT-LLM, and other named serving engines
