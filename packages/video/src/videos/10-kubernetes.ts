import type { VideoScript } from "./types.ts";

/**
 * Module 10 — Kubernetes. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/10-kubernetes.mdx; the narration is the editable
 * artifact, and `at` values are fractions of a scene until narration timestamps replace them with cues.
 */
export const kubernetes: VideoScript = {
  slug: "10-kubernetes",
  module: "10",
  plate: "PLATE 10 · KUBERNETES",
  chapter: "Kubernetes",
  title: "Kubernetes: replicas are not capacity",
  youtube: {
    titleSuffix: "Kubernetes: replicas are not capacity",
    summary:
      "How Kubernetes decides where a GPU workload lands and whether a rollout survives: reconciliation, scheduling with requests and tolerations, readiness against liveness, disruption budgets, and why a higher replica count can deliver no extra capacity. Module 10 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 10 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/10-kubernetes/",
      },
      {
        label: "Module 9: Model Serving",
        url: "https://handbook.vinodspattar.in/learn/modules/09-model-serving/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "Kubernetes",
      "GPU scheduling",
      "autoscaling",
      "PodDisruptionBudget",
      "AI infrastructure",
      "system design",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "Twenty replicas, no new capacity",
      narration:
        "Traffic spikes. The autoscaler does its job and raises the replica count from three toward twenty, and the dashboards agree. Yet nothing gets faster. The new pods are sitting Pending, because the GPU node pool has no free capacity and no new GPU node has been provisioned. An autoscaling event that looks successful has delivered no serving capacity at all. Nothing here is broken. Kubernetes did exactly what the manifests said. It does not know what you mean.",
      map: {
        places: [
          { id: "hpa", label: ["Autoscaler", "wants more replicas"], x: 0, y: 226, w: 380, h: 100 },
          { id: "pods", label: ["New pods", "Pending"], x: 540, y: 226, w: 300, h: 100, beat: 0 },
          {
            id: "pool",
            label: ["GPU node pool", "no free GPU"],
            x: 1000,
            y: 70,
            w: 420,
            h: 100,
            beat: 1,
          },
          {
            id: "cap",
            label: ["Serving capacity", "unchanged"],
            x: 1000,
            y: 384,
            w: 420,
            h: 100,
            beat: 2,
          },
        ],
        links: [
          { from: "hpa", to: "pods", beat: 0, arrow: "end" },
          { from: "pods", to: "pool", beat: 1, arrow: "end", tone: "fault" },
          { from: "pods", to: "cap", beat: 2, arrow: "end", dashed: true, tone: "fault" },
        ],
      },
      runs: [
        { beat: 0, paths: [["hpa", "pods"]], results: ["ok"], marks: ["replica count goes up"] },
        {
          beat: 1,
          paths: [["pods", "pool"]],
          results: ["stall"],
          marks: ["nowhere to schedule"],
        },
      ],
      captions: [
        "The autoscaler raises the replica count, and the dashboards agree.",
        "The new pods stay Pending: the GPU node pool has no free capacity.",
        "The count went up. The serving capacity did not.",
      ],
      beats: [
        { at: 0 },
        { at: 0.24, cue: "The new pods are sitting Pending" },
        { at: 0.52, cue: "An autoscaling event that looks successful" },
      ],
    },
    {
      id: "model",
      kind: "lanes",
      headline: "Declare it, and Kubernetes reconciles",
      narration:
        "Kubernetes does not run anything directly. It continuously reconciles observed cluster state toward declared desired state, through a small set of objects that compose. A Deployment declares that a number of copies of a pod should exist. Its ReplicaSet is the reconciliation loop that keeps the count correct, while the Deployment manages rolling updates. A Service gives a stable network identity in front of a changing set of pods. The horizontal pod autoscaler adjusts the replica count from observed metrics. And a pod disruption budget is a constraint the cluster must respect during voluntary disruptions, like rollouts and node drains, as opposed to involuntary ones, like a node crashing.",
      lanes: [
        {
          title: "Keep N copies",
          subtitle: ["The ReplicaSet is the loop. The Deployment manages rolling updates."],
          chain: ["Deployment", "ReplicaSet", "Pod"],
        },
        {
          title: "Reach them",
          subtitle: ["A stable identity in front of a changing set of pods."],
          chain: ["Service", "Pod"],
        },
        {
          title: "Scale and constrain",
          subtitle: ["Metrics adjust the count. A budget limits voluntary disruption."],
          chain: ["Autoscaler adjusts replicas", "Budget limits drains"],
        },
      ],
      takeaway: "Observed state is reconciled toward declared state.",
      beats: [
        { at: 0.22, cue: "A Deployment declares" },
        { at: 0.5, cue: "A Service gives a stable network identity" },
        { at: 0.64, cue: "The horizontal pod autoscaler adjusts" },
        { at: 0.9, cue: "as opposed to involuntary ones" },
      ],
    },
    {
      id: "map",
      kind: "diagram",
      layout: "10-kubernetes.scheduling-and-scaling",
      headline: "Two loops that only meet indirectly",
      narration:
        "Here is the whole picture. A client request enters through Ingress, reaches a Service, and lands on a pod. Behind that sit the workload objects. The autoscaler adjusts the Deployment, the Deployment owns a ReplicaSet, and the ReplicaSet owns the pods, reporting the desired replica count to the API server. The control plane holds that API server, with its state in etcd, and the scheduler, which binds pods to nodes. There are two node pools. A pod with no GPU request is bound to the CPU pool. A pod that requests a GPU, with a matching toleration, is bound to the tainted GPU pool. A pod disruption budget protects the pods during a drain. Notice the two independent loops: the scheduler binds once, at pod creation, while the autoscaler adjusts the count continuously.",
      legend: [
        { kind: "place", label: "object" },
        { kind: "store", label: "cluster state" },
        { kind: "route", label: "request or binding" },
        { kind: "region", label: "pool or plane" },
      ],
      steps: [
        {
          at: 0,
          show: ["Client", "e1", "Ingress", "e2", "Svc", "e3", "Pod1"],
          focus: ["Client", "Ingress", "Svc", "Pod1", "e1", "e2", "e3"],
        },
        {
          at: 0.2,
          cue: "The autoscaler adjusts the Deployment",
          show: ["Workloads", "HPA", "e4", "Deploy"],
          focus: ["HPA", "e4", "Deploy"],
          camera: ["HPA", "Deploy", "RS"],
        },
        {
          at: 0.28,
          cue: "the Deployment owns a ReplicaSet",
          show: ["RS", "e5", "e6"],
          focus: ["Deploy", "RS", "Pod1", "e5", "e6"],
          camera: ["HPA", "Deploy", "RS", "Pod1"],
        },
        {
          at: 0.37,
          cue: "reporting the desired replica count",
          show: ["ControlPlane", "API", "e10"],
          focus: ["RS", "API", "e10"],
          camera: ["RS", "API", "Pod1"],
        },
        {
          at: 0.46,
          cue: "with its state in etcd",
          show: ["Etcd", "e8"],
          focus: ["API", "Etcd", "e8"],
          camera: ["API", "Etcd", "Sched"],
        },
        {
          at: 0.52,
          cue: "and the scheduler, which binds pods",
          show: ["Sched", "e9"],
          focus: ["Sched", "API", "e9"],
          camera: ["API", "Etcd", "Sched"],
        },
        {
          at: 0.6,
          cue: "A pod with no",
          show: ["Nodes", "CPUPool", "NodeCPU", "e11", "e13"],
          focus: ["Sched", "NodeCPU", "e11", "Pod1", "e13"],
          camera: ["Sched", "Pod1", "NodeCPU"],
        },
        {
          at: 0.7,
          cue: "A pod that requests a",
          show: ["GPUPool", "NodeGPU", "e12"],
          focus: ["Sched", "NodeGPU", "e12", "GPUPool"],
          camera: ["Sched", "NodeCPU", "NodeGPU", "GPUPool"],
        },
        {
          at: 0.8,
          cue: "A pod disruption budget protects",
          show: ["PDB", "e7"],
          focus: ["PDB", "Pod1", "e7"],
          camera: ["PDB", "Pod1", "RS"],
        },
        {
          at: 0.88,
          cue: "Notice the two independent loops",
          show: [],
          focus: ["HPA", "Sched"],
          camera: ["HPA", "Sched", "NodeGPU"],
        },
      ],
    },
    {
      id: "gpu",
      kind: "anatomy",
      headline: "The scheduler only knows what you declare",
      narration:
        "The scheduler knows only what you declare. GPU nodes are expensive, so clusters taint the GPU pool, and nothing lands there by accident. A pod that needs a GPU declares both a matching toleration and the resource request, and usually a node selector, to be explicit. The GPU is requested as an integer. Fractional requests are not supported the way CPU and memory are, so a pod gets a whole GPU or none. A request is what the scheduler uses to decide whether a pod fits. A limit is the ceiling where the container is throttled or killed. Leave out the toleration, and the pod can sit Pending forever. Leave out the GPU request, and it can land on a GPU node and silently never use the GPU.",
      lines: [
        { text: "tolerations:", group: "route" },
        { text: "  - key: nvidia.com/gpu", group: "route" },
        { text: "    operator: Exists", group: "route" },
        { text: "    effect: NoSchedule", group: "route" },
        { text: "nodeSelector:", group: "route" },
        { text: "  cloud.provider/pool: gpu", group: "route" },
        { text: "", group: "plain" },
        { text: "resources:", group: "meta" },
        { text: '  requests: { cpu: "2", memory: "8Gi", nvidia.com/gpu: "1" }', group: "meta" },
        { text: '  limits:   { cpu: "4", memory: "16Gi", nvidia.com/gpu: "1" }', group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "Where it may land",
          body: "A toleration matches the pool's taint. A node selector makes the target explicit.",
        },
        {
          group: "meta",
          title: "What it needs",
          body: "GPUs are whole numbers. A request reserves capacity. A limit is the ceiling.",
        },
      ],
      beats: [
        { at: 0.16, cue: "A pod that needs a" },
        { at: 0.4, cue: "is requested as an integer" },
      ],
    },
    {
      id: "probes",
      kind: "axis",
      headline: "Liveness restarts. Readiness pauses.",
      narration:
        "Probes answer two different questions. A liveness probe asks whether this process is alive, or should be restarted. Failing it kills and restarts the container. A readiness probe asks whether this pod should receive traffic right now. Failing it removes the pod from the Service's endpoints, without a restart. Conflating them is a common failure. A pod under temporary load that fails a liveness probe is restarted, losing every in-flight request, when a readiness probe would have paused new traffic until it recovered. The readiness endpoint should also report real state. On shutdown, it starts returning an unavailable status, so Kubernetes stops routing new traffic before the pod is torn down.",
      ends: ["destroys in-flight work", "preserves in-flight work"],
      stations: [
        {
          name: "Liveness",
          line: "Is the process alive?",
          detail: "Failing it kills and restarts the container.",
        },
        {
          name: "Readiness",
          line: "Should it get traffic now?",
          detail: "Failing it removes the pod from Service endpoints, with no restart.",
        },
      ],
      beats: [
        { at: 0.1, cue: "A liveness probe asks" },
        { at: 0.28, cue: "A readiness probe asks" },
      ],
    },
    {
      id: "disruption",
      kind: "lanes",
      headline: "A budget makes the drain wait",
      narration:
        "Rolling updates and node drains are the other way to take yourself down. A Deployment replaces old pods with new ones gradually. A PodDisruptionBudget sets a floor on how many pods can be down at once for voluntary disruptions. Both a rollout and a node drain check it, and refuse to proceed if it would violate the budget. Without one, a node drain during a deploy can take every replica down at once, if they happen to be co-located. That is a full outage. In the module's manifest, the budget says at least two replicas must stay available, out of three.",
      lanes: [
        {
          title: "No budget",
          subtitle: ["Replicas happen to share the draining node."],
          chain: ["Node drain during a rollout", "Co-located replicas go down", "Full outage"],
          tone: "fault",
        },
        {
          title: "minAvailable: 2",
          subtitle: ["Two of the module's three replicas must stay up."],
          chain: ["Node drain or rollout", "Budget checked first", "The drain waits"],
        },
      ],
      takeaway: "Rollouts and drains both respect the budget.",
      beats: [
        { at: 0.52, cue: "Without one, a node drain" },
        { at: 0.82, cue: "at least two replicas must stay available" },
        { at: 0.9 },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where it breaks",
      narration:
        "Five failures to know. GPU pods stuck Pending after a scale-up: the replica count looks right, but no GPU node is available. Check pod status, not just the autoscaler's number. A liveness probe wired to an endpoint that can be slow under load, which restarts the container and discards in-flight requests. A rollout or node drain with no disruption budget, where co-located replicas can all go at once. Resource requests set too low, which lets the scheduler over-pack a node, so throttling and out-of-memory kills appear only under production traffic, never in a lightly loaded staging cluster. And the wrong workload object. A sharded, stateful workload run as a Deployment loses the stable identity and storage a rescheduled pod needs, while a stateless model server run as a StatefulSet pays for ordinal identity it never uses.",
      map: {
        places: [
          { id: "pool", label: ["GPU pool"], x: 0, y: 226, w: 240 },
          { id: "probe", label: ["Liveness probe"], x: 330, y: 226, w: 260 },
          { id: "drain", label: ["Node drain"], x: 680, y: 226, w: 240 },
          { id: "requests", label: ["Resource requests"], x: 1010, y: 226, w: 300 },
          { id: "object", label: ["Workload object"], x: 1400, y: 226, w: 300 },
        ],
        links: [
          { from: "pool", to: "probe", arrow: "end" },
          { from: "probe", to: "drain", arrow: "end" },
          { from: "drain", to: "requests", arrow: "end" },
          { from: "requests", to: "object", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "pool",
          title: "GPU pods stuck Pending",
          body: "The count looks right, but there is no free GPU node. Check pod status.",
        },
        {
          at: "probe",
          title: "Liveness on a slow endpoint",
          body: "A restart discards every in-flight request. Readiness would only pause traffic.",
        },
        {
          at: "drain",
          title: "No disruption budget",
          body: "Co-located replicas can all go down in one drain.",
        },
        {
          at: "requests",
          title: "Requests set too low",
          body: "Over-packed nodes. Throttling and OOM kills appear only under production load.",
        },
        {
          at: "object",
          title: "The wrong object",
          body: "A stateful shard as a Deployment, or a stateless server as a StatefulSet.",
        },
      ],
      beats: [
        { at: 0.06, cue: "pods stuck Pending after a scale-up" },
        { at: 0.24, cue: "A liveness probe wired to an endpoint" },
        { at: 0.42, cue: "A rollout or node drain with no disruption budget" },
        { at: 0.58, cue: "Resource requests set too low" },
        { at: 0.8, cue: "the wrong workload object" },
      ],
    },
    {
      id: "scaling",
      kind: "bars",
      headline: "The lower ceiling wins",
      narration:
        "Scaling has three traps. First, the autoscaler's target metric matters more than its existence. Scaling on CPU for a workload whose real bottleneck is in-flight requests or GPU memory scales on the wrong signal and lags demand. The module's manifest targets in-flight requests per pod. Second, ceilings. The cluster autoscaler's node pool limit is a hard ceiling, independent of the replica maximum. An autoscaler set to twenty replicas is meaningless if the GPU pool is capped at capacity for ten, so size both against one capacity plan. Third, scale down. Scaling down fast saves money but risks paying the GPU provisioning delay again on the next spike, and GPU capacity commonly takes minutes where CPU takes seconds.",
      items: [
        {
          label: "Autoscaler maximum",
          value: 20,
          unit: "replicas",
          note: "What the manifest asks for",
          tone: "normal",
        },
        {
          label: "GPU pool capacity",
          value: 10,
          unit: "replicas",
          note: "What the node pool can hold",
          tone: "fault",
        },
      ],
      caption: "The module's example: the replica maximum is meaningless above the pool's cap.",
      beats: [
        { at: 0.5, cue: "set to twenty replicas" },
        { at: 0.62, cue: "capped at capacity for ten" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to take away. One: the scheduler knows only what you declare, so GPU requests, tolerations and node selectors are correctness requirements, not optimizations. Two: a replica count is not capacity. Check pod status, and size the autoscaler and the node pool against one capacity plan. Three: readiness pauses traffic while liveness restarts, and a disruption budget makes drains wait. There is no dedicated Kubernetes lab yet, so reproduce GPU pods stuck Pending yourself, on a local kind or minikube cluster. Links are in the description.",
      points: [
        {
          statement: "Declare what you mean",
          support: "Requests, tolerations and node selectors are correctness, not tuning.",
          glyph: "gate",
        },
        {
          statement: "Replicas are not capacity",
          support: "Check pod status. Size the autoscaler and the node pool together.",
          glyph: "stack",
        },
        {
          statement: "Protect the in-flight work",
          support: "Readiness pauses traffic, liveness restarts, a budget makes drains wait.",
          glyph: "loop",
        },
      ],
      footer: "Next: reproduce GPU pods stuck Pending on a local kind or minikube cluster.",
      beats: [
        { at: 0.1, cue: "the scheduler knows only what you declare" },
        { at: 0.32, cue: "a replica count is not capacity" },
        { at: 0.56, cue: "readiness pauses traffic while liveness restarts" },
        { at: 0.76, cue: "stuck Pending yourself" },
      ],
    },
  ],
};
