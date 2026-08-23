# Kubernetes for AI: Getting the Primitives Right When GPUs Are on the Line

_Kubernetes doesn't understand your AI workload's actual needs — it does exactly what the manifest says, so scheduling, probes, and disruption budgets have to be declared correctly or the cluster will confidently do the wrong thing with expensive GPU capacity._

- **Source:** [module:10-kubernetes](/learn/modules/10-kubernetes/)
- **Runtime:** 17:26 · 41 turns · 11 beats
- **Written by:** claude-sonnet-5 on 2026-08-22
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. Why Kubernetes Is Correctness-Critical for AI

**Host:** So we're spending this whole episode on Kubernetes and AI, and I want to start by pushing back on the obvious take, which is that this is just generic container orchestration with some GPUs sprinkled in. Why does it deserve that much airtime?

**Guest:** Because Kubernetes isn't just running containers here, it's making the actual decisions that determine whether your AI platform works at all. It decides which physical GPU a workload lands on, how many replicas of a model server exist right now, and whether a rollout can happen without dropping requests mid-flight. Those are expensive, consequential decisions, and Kubernetes will execute them exactly as declared, no matter how wrong that declaration is.

**Host:** And that's the scary part, right, it doesn't fail loudly when you get it wrong. It just quietly does the wrong thing.

**Guest:** Exactly, it'll happily schedule a GPU workload onto a node that can never satisfy it and leave it queued forever, or roll a deployment straight through every healthy replica because nothing told it not to. None of this requires exotic knowledge, it's the same handful of primitives — scheduling, probes, disruption budgets — just applied correctly or not.

---

## 2. The Reconciliation Model: Pods, Deployments, Services, HPA, PDB

**Host:** So let's lay out the actual pieces Kubernetes is reconciling, because I think people hear 'orchestration' and imagine something more active than it is. Walk me through the objects.

**Guest:** It's a small composable set. A Pod is just the running container, the thing the scheduler places on a node. A Deployment declares 'N copies of this pod should exist,' it creates a ReplicaSet, and that ReplicaSet is the actual loop constantly checking that the count matches — the Deployment layer on top is what orchestrates rolling updates across ReplicaSets. Then a Service gives you a stable network identity in front of whichever pods happen to exist right now, an HPA adjusts that replica count based on metrics, and a PodDisruptionBudget constrains what the cluster is allowed to do to you voluntarily — rollouts, drains — separate from a node just crashing on its own.

**Host:** And that reconciliation loop is exactly where the GPU danger lives, right — it's matching desired state to actual state, but it has no idea 'desired state' should mean a working GPU.

**Guest:** Right, it only knows what's in the manifest. Skip the GPU resource request and a pod can land on a GPU node and just never touch the GPU, silently wasting the most expensive thing in your cluster. Get the request right but forget the toleration for a tainted GPU pool, and now it sits Pending forever, because nothing told it that pool is eligible. Same reconciliation loop either way — it's doing exactly what you wrote, not what your workload needed.

---

## 3. Two Independent Loops: Scheduler vs. HPA

**Host:** So there are actually two separate control loops running here, and they don't really talk to each other directly. Walk me through how the scheduler and the HPA end up in the same story.

**Guest:** Right, the scheduler only runs once, at pod creation — it binds a pod to a node and then it's done, it's not watching that decision over time. The HPA is completely different, it's continuously watching live metrics and adjusting the Deployment's desired replica count on an ongoing basis. They only interact indirectly: the HPA decides you need more replicas, creates that intent, and then hands the scheduler a fresh batch of pods it now has to go find homes for.

**Host:** And that's the part that sounds fine on a dashboard — replica count goes up, looks like a successful scale-up.

**Guest:** Exactly, but if the GPU pool is already maxed out, those new pods just sit there Pending, they never get bound to a node. The Deployment will happily report that replica count went up, HPA did its job, but your actual serving capacity hasn't moved at all — you've got a metric that looks like success and a user-facing request queue that's still backing up.

---

## 4. GPU Scheduling Correctness: Requests, Limits, Taints, and Tolerations

**Host:** So that Pending pod problem — is that just capacity, or is there a scheduling correctness issue underneath it too? Because I've seen GPU pods land on the wrong node entirely, or refuse to schedule on a node that clearly has a GPU sitting idle.

**Guest:** That's almost always requests and limits and the taint setup being wrong, not capacity. The scheduler only looks at what a pod requests to decide if it fits — so if you request nvidia.com/gpu as '1', you get a whole GPU or nothing, there's no fractional GPU scheduling like there is with CPU. If you get that request wrong, or leave it off entirely, the scheduler doesn't know it needs to reserve a GPU at all and can over-pack the node, so pods end up competing for actual GPU resources at runtime even though the scheduler thought there was room.

**Host:** And that's where the taints come in, right — keeping things from accidentally landing on GPU nodes in the first place?

**Guest:** Exactly, clusters taint the GPU pool, something like nvidia dot com slash gpu equals present, no schedule, so nothing lands there by default because those nodes are expensive. Your model-server pod then needs a toleration for that taint plus, usually, a nodeSelector or affinity rule pointing at the GPU pool by label — the toleration just says 'I'm allowed here,' it doesn't say 'put me here,' so you want both declared explicitly rather than trusting one mechanism to do the whole job.

---

## 5. Readiness vs. Liveness: Don't Kill What You Should Just Pause

**Host:** So we've got the toleration and affinity sorted, the pod's actually landing on the right GPU node. But there's a whole separate failure mode once it's running: what happens when it's temporarily struggling versus actually dead. Walk me through readiness versus liveness, because I've seen these two get conflated in ways that are genuinely expensive here.

**Guest:** Right, they answer completely different questions. Liveness is 'should this process be killed and restarted,' readiness is 'should this pod currently get traffic' — and failing readiness just pulls it out of the Service's endpoint list without touching the process at all. The failure mode is a pod under a heavy batch of inference requests failing a liveness check because it's slow to respond, so Kubernetes kills it and you lose every in-flight request, when a readiness probe would've just paused new traffic for a few seconds until it caught up.

**Host:** And the example in the module doesn't hardcode /readyz to always return 200, it's actually wired to real state — there's a draining flag that flips on shutdown.

**Guest:** Exactly, that's the part people skip. On shutdown you set draining to true and readyz immediately starts returning 503, so Kubernetes stops routing new requests before SIGTERM even finishes tearing the pod down — you get a truthful signal instead of a lie. And that's literally the same graceful-drain discipline as the DrainCoordinator pattern from the gateway module; the readiness probe is just that same idea surfaced at the layer Kubernetes actually checks.

---

## 6. Rolling Updates and PodDisruptionBudgets

**Host:** Okay, so readiness handles the single-pod case truthfully. But what stops a rollout or a node drain from just yanking multiple replicas at once, even if each one is individually reporting its state correctly?

**Guest:** That's what maxUnavailable and maxSurge on the Deployment, and the PodDisruptionBudget, are for. The rollout config controls how many old pods get replaced at once during your own deploy, but a PDB with minAvailable set to two, say, is a floor that applies to any voluntary disruption — your rollout, but also a node drain for maintenance or an autoscaler cycling nodes out. Kubernetes literally refuses to evict a pod if doing so would drop you below that floor.

**Host:** So without the PDB, a node drain during a deploy could take down every replica at the same time if they happened to land on the same node?

**Guest:** Right, that's exactly the scenario it prevents — three replicas, no PDB, all co-located, and a drain event or a badly timed rollout takes all three down simultaneously because nothing told Kubernetes that's unacceptable. The PDB is the thing that makes 'at least two of these must stay up' an actual constraint the eviction and rollout machinery has to respect, not just an assumption you're hoping holds.

---

## 7. StatefulSets: When Replicas Aren't Interchangeable

**Host:** So PDBs handle the 'don't take them all down at once' problem, but that still assumes any surviving replica can pick up the slack. What happens when that assumption itself is false — when replica three isn't actually a substitute for replica one?

**Guest:** Then you've got the wrong object entirely. A Deployment gives you interchangeable pods — any replica can be killed and rescheduled and a new one comes up with no identity, no history, and that's fine because any replica can serve any request. But a sharded vector index or a model server with pinned GPU-to-shard assignment doesn't work that way — pod-2 owns shard 2's data and state, and if it gets rescheduled with no memory of being pod-2, it doesn't resume, it just shows up empty. That's what a StatefulSet is for: stable ordinal identity, pod-0 through pod-n, and storage that follows each specific pod across rescheduling instead of being handed out fresh.

**Host:** And the failure mode runs both directions, presumably — it's not just 'stateful workload as a Deployment loses your shards.'

**Guest:** Exactly, the reverse mistake is just as real: taking a genuinely stateless model server and running it as a StatefulSet out of caution buys you nothing but the ordinal identity and per-pod storage overhead, with no benefit since there's no state to reattach. So this isn't 'StatefulSets are safer, default to them' — it's match the object to whether replicas are actually interchangeable. Ask does pod-2 need to come back as pod-2, with its data, or can literally any fresh pod take its place — that answer tells you which object you need, and getting it backwards either leaves a rescheduled pod unable to resume correctly because it lost its stable identity and storage, or just wastes operational complexity you didn't need to take on.

---

## 8. The Illusion of Successful Autoscaling

**Host:** Let's walk through a scenario that I think trips up a lot of teams: the HPA does exactly what it's supposed to do, scales from 3 to 20 replicas under load, and the dashboard proudly shows 20. What's actually going wrong here?

**Guest:** The HPA created 20 pod specs, but GPU capacity is scarce and slow to provision, so the cluster autoscaler either hasn't spun up new GPU nodes yet or physically can't because of quota limits or a regional shortage. Those new pods just sit there in a Pending state indefinitely, waiting for a node that isn't coming any time soon. Meanwhile the HPA's own reporting only tracks desired replica count against its metric, so from its point of view it did its job correctly — the number says 20, and everything looks fine unless you know to look past that number.

**Host:** So the dashboard is technically accurate and completely misleading at the same time. What actually catches this before it becomes an incident?

**Guest:** You have to check pod status directly — Pending versus Running — not just trust the HPA's reported replica count, because that count reflects intent, not served capacity. And it compounds with two other things worth checking: is the HPA even scaling on the right metric, since CPU utilization on a GPU-bound serving workload can lag real demand, and is the node pool's autoscaler ceiling actually large enough to satisfy maxReplicas in the first place. GPU provisioning commonly takes minutes rather than the seconds CPU capacity takes, which is exactly why keep-warm buffers matter so much more here than for a typical stateless web service.

---

## 9. Security as Isolation: Resource Limits, Taints, and RBAC

**Host:** Let's shift gears slightly — we've talked about requests and limits and taints purely as scheduling mechanics, getting the right pod on the right node. But you've said there's a security dimension to all of this that people miss. What do you mean?

**Guest:** Those same primitives are your isolation boundary, whether you designed them that way or not. If you don't enforce resource limits on a multi-tenant cluster, one noisy or runaway workload degrades everything else sharing that node — that's not a scheduling bug, that's a tenant-isolation failure. Same logic applies to GPU taints: without them, any pod with a loose enough scheduling policy can land on expensive GPU capacity it was never authorized to touch, so the taint is functioning as coarse access control, not just placement hygiene. And it extends to identity too — if you've got an operator or controller pod calling the Kubernetes API directly, its service account needs least-privilege RBAC scoping just like any other credential, because the default service account carrying cluster-admin-equivalent permissions is a much bigger blast radius than people account for when they're just trying to get something scheduled.

---

## 10. Trade-offs: GPU Pool Topology and the Scale-Down Gamble

**Host:** Let's talk cluster topology for a second, because I think there's a real dedicated-versus-mixed-pool decision buried in here. Why not just let GPU and non-GPU workloads share nodes and let the scheduler sort it out?

**Guest:** You can, but you're trading cost attribution and safety for simplicity. A dedicated tainted GPU pool means only GPU workloads land there, your billing is clean, and nothing accidentally eats scheduling headroom on your expensive nodes — the cost is you're now managing an extra pool and you can end up with idle GPU capacity if your bin-packing isn't tight. A mixed pool is one less thing to operate, but a CPU-heavy workload's resource requests can crowd out the room a GPU pod needs, and now you're debugging a scheduling failure that's really a topology decision you made months ago. There's a similar gamble on the scaling side: scale down fast after a load drop and you save real money, but you're betting the next traffic spike doesn't arrive before you've re-provisioned GPU capacity, and that provisioning delay is minutes, not seconds — so you repay the cold-start penalty you thought you'd already gotten past.

**Host:** So keeping some replica headroom at rest is basically buying insurance against your own autoscaler being too good at its job.

**Guest:** Exactly, and the same speed-versus-capacity trade shows up in rollouts through maxSurge — crank it up and your rolling update finishes faster, but you need more total capacity sitting available during the transition, which on GPU nodes is not a cheap ask. None of these are right-or-wrong settings, they're dials, and the mistake is leaving them at a stateless-web-service default and assuming GPU economics don't apply.

---

## 11. Proving It Yourself: The Lab Reproduction and the Interview Questions

**Host:** So before we let people go, there's an exercise worth actually doing rather than just nodding along to. Take this module's Deployment manifest, unmodified, and apply it to a local kind or minikube cluster that has no real GPU nodes at all. Then just check on your pods and watch what happens.

**Guest:** Every replica sits Pending, and that's the whole point — the node selector field and the tolerations are targeting a GPU pool that doesn't exist on your laptop, so the scheduler has nowhere to place them and it just says so, quietly, forever. Then go back in, strip out the node selector, the tolerations, and the GPU resource request, reapply, and watch the same pods schedule immediately. You've now reproduced, on purpose, in five minutes, the exact failure this whole episode has been warning about — and if you ever get asked in an interview what you check when an HPA says it wants five replicas but only two are serving traffic, the answer is exactly this: check pod status, not the HPA's desired count, because Pending means the scheduler is stuck, not that the app is broken.

**Host:** Which is really the thread running through every segment today — liveness versus readiness, PDBs during a drain, StatefulSets for pinned shards, the scale-down gamble on GPU pools — none of it is Kubernetes being clever on your behalf. It does precisely what the manifest says, so the job is making sure the manifest says what you actually mean. That's the episode — thanks for listening, and go make those pods sit Pending on purpose.
