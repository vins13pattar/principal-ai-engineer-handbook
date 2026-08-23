### 1. Declare it, don't command it

**Host:** So let's start with the thing that trips up almost everyone coming from a more traditional infrastructure background: Kubernetes never actually does anything. You run kubectl apply and it feels like a command, but it's not — it's a memo you're leaving for the cluster.

**Guest:** Exactly right. That apply just writes your desired state into etcd, the cluster's backing store, and then a whole set of controllers spend forever comparing that desired state to what's actually running and nudging reality toward it. There's no moment where 'creating the pod' happens as a single atomic action you can point to — it's a loop, and it either converges quickly, converges slowly, or never converges and you're left wondering why.

**Host:** Which is why half of debugging Kubernetes is really just asking 'which controller owns this, and what can it even see.' So walk me through the small set of objects that actually make up this system — the ones we'll keep coming back to.

**Guest:** It's a short list. A Pod is the actual scheduling unit, a Deployment manages a ReplicaSet which manages pods and gives you rolling updates, a Service is a stable address that load-balances across whatever pods match its selector, and an Operator is just this same reconciliation pattern applied to your own custom objects. Underneath all of it sits etcd, holding the one source of truth everything else is reconciling against — and for AI workloads specifically, the parts that matter most are how the scheduler places pods and what requests and limits actually enforce, because that's where GPU workloads start breaking assumptions built for ordinary web services.

### 2. Requests, limits, and why GPUs don't play by CPU rules

**Host:** So let's get concrete on requests and limits, because I think most people assume they're basically the same number expressed two ways. What's actually different about the job each one does?

**Guest:** They're doing completely different jobs. The scheduler only looks at requests when deciding which node a pod lands on — if you skip requests, the scheduler assumes near-zero and happily packs that node until everything on it is starving together. Limits only kick in after the pod is running, and here's the part people miss: CPU limits throttle you, memory limits kill you. Blow past your CPU limit and the kernel just slows your process down, which shows up as mysterious latency that looks like slow code, not a config problem. Blow past your memory limit and the OOM killer ends the container outright, no warning.

**Host:** And that's where QoS class comes in, right — Guaranteed, Burstable, BestEffort? How does a pod actually end up in one of those?

**Guest:** You don't set it, Kubernetes derives it from whether your requests equal your limits, for every resource, every container. Set both equal and you're Guaranteed, the last to get evicted under pressure; set one and not the other and you silently drop to Burstable without noticing. And GPUs break the whole mental model further — there's no fractional request by default, you get a whole device or none, no overcommit, which is why GPU nodes carry taints. Without that taint, a random CPU-only pod schedules onto your expensive GPU box, occupies it, and now you're paying for an accelerator that nothing running there can even use.

### 3. Probes, drains, and the disruption budget deadlock

**Host:** Let's talk about probes, because I've seen teams write a liveness check that pings the database, and it feels responsible right up until the database has a bad five minutes. What actually happens there?

**Guest:** You get a cascading restart storm exactly when you can least afford it. Liveness is only supposed to answer 'is this process wedged and needs a restart' — readiness answers 'is this pod ready for traffic,' and startup just tells Kubernetes to hold off on both while the thing boots. Conflate liveness with a dependency check and a slow database turns into Kubernetes killing every healthy pod that talks to it, which is strictly worse than the original incident.

**Host:** And that restart isn't instant either — there's a grace period in play. Where does that collide with disruption budgets during a rollout?

**Guest:** Default grace period is thirty seconds — SIGTERM, then SIGKILL if you haven't shut down cleanly, so your drain logic has to finish inside that window or it gets forced. Now put a PodDisruptionBudget on top that's stricter than what the rollout can afford, and it simply can't proceed — it's not an error, it just stalls forever, quietly waiting on a constraint you wrote for a different scenario.

### 4. Where the assumptions break, and what's underneath

**Host:** Last thing, because I think it's the one that bites teams the hardest when they try to autoscale these workloads like they would a web tier. What actually goes wrong?

**Guest:** Two things stack on top of each other. First, HPA on CPU is just the wrong signal for anything I/O-bound — CPU sits flat while requests queue up, so by the time it triggers, the service has already fallen over; you want queue depth or latency instead. Second, even if you fix the signal, cold start for a model workload is minutes, not seconds — image pull, model download, accelerator init — so any autoscaler reacting to current load is reacting too late by definition, and that's really a model-serving design problem more than a Kubernetes knob. If you want the deeper mechanics, the etcd Raft consensus underneath the control plane and the full accelerator and scheduling story are in the Kubernetes module and the model-serving architecture writeup — everything we covered today is really just the reconciliation loop meeting reality at each of those layers.

**Host:** Declare it, let it reconcile, and know exactly which assumption breaks first. That's the episode — thanks for walking through all of it.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A worked kubectl/YAML walkthrough of the GPU Deployment/HPA/PDB manifest
- StatefulSet ordinal identity and stable-storage mechanics in depth
- The full model-serving cold-start and batching argument
- Raft's quorum arithmetic and election-timing details
