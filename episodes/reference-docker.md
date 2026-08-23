# Docker: The Process Pretending to Be a Machine

_A container is just a restricted process, not a tiny VM — and once that fact is internalized, cache discipline, PID 1 signal handling, and default insecurity all stop being separate mysteries and become consequences of the same single mechanism._

- **Source:** [reference:docker](/reference/lookups/docker/)
- **Runtime:** 5:50 · 13 turns · 4 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. No VM, no guest kernel: what a container and an image actually are

**Host:** So let's start with the thing people get wrong on day one: what actually is a container? Most folks picture a tiny virtual machine, a little box with its own mini operating system inside. Is that even close?

**Guest:** Not really, and that misconception causes half the confusion later. A container is just a regular process running on the host kernel — there's no guest kernel, no hypervisor, nothing virtualized underneath it. What makes it look like a separate machine is two kernel features: namespaces, which restrict what the process can see — its own PIDs, network, mounts, users — and cgroups, which restrict what it can consume, like CPU and memory. That's it. That's the whole trick, which is also why containers start in milliseconds.

**Host:** Okay, so if the container itself is just a fenced-in process, what's the image sitting behind it — is that the 'disk' for this pretend machine?

**Guest:** Sort of, but again simpler than it sounds. An image is a stack of read-only filesystem layers plus some metadata, where each layer is just the filesystem delta produced by one build instruction. Once you see it that way, most build headaches stop being mysterious rules to memorize and become one question: which layer changed, and what did the cache have to throw away because of it. Everything we're going to talk about today — caching, PID 1 weirdness, why containers are insecure by default — all of it traces back to these two ideas: restricted process, layered filesystem.

---

## 2. Why builds are slow, why 'RUN rm' lies, and how multi-stage fixes both

**Host:** So if a layer is just the delta from one instruction, that means the order I write my Dockerfile instructions in isn't just style, it's actually deciding how much gets rebuilt every time. Walk me through why that's such a big deal in practice.

**Guest:** Right — the cache rule is brutal and simple: the first changed layer invalidates itself and every single layer after it, no matter how trivial the change was. So the classic mistake is copying your entire source tree first, then installing dependencies. Now every source edit, even a comment change, reinvalidates the dependency install, and you're reinstalling packages that never changed. Flip it — copy just the lockfile, install dependencies, then copy source — and that expensive layer stays cached, since layers are reused whenever the instruction and its inputs are unchanged. And none of that helps if your build context itself is huge, which is why a missing .dockerignore is usually the actual reason someone's build is slow: the whole directory, node\_modules and all, gets shipped to the daemon before the build even starts.

**Host:** Okay, and that same layer logic is exactly why 'RUN rm' feels like a lie, isn't it — you delete the file but the image doesn't get smaller.

**Guest:** Exactly, because the earlier layer that created the file is still sitting in the stack, immutable, content-addressed, untouched. Your delete just adds a new layer on top saying 'this file is gone,' but the bytes are still shipped and stored underneath. The fix is either delete it in the same RUN instruction that created it, or better, go multi-stage: build everything — compilers, dev headers, caches — in one throwaway stage, then copy only the final artifact into a clean minimal stage. That's not a cosmetic trick, that's routinely an order-of-magnitude size drop, because the entire toolchain that produced your binary simply never makes it into the image people actually pull and run.

---

## 3. PID 1, root by default, and the shutdown that silently becomes a SIGKILL

**Host:** So walk me through something that's bitten a lot of people: you send a graceful shutdown, your app has drain logic and everything, and the container just gets killed anyway. What's actually going on there?

**Guest:** It comes down to two facts colliding. PID 1 in Linux gets no default signal handlers at all, so if your CMD is written in shell form, Docker wraps it in a shell, that shell becomes PID 1, and it typically just doesn't forward SIGTERM to your app. Docker sends the stop signal, waits its default ten seconds, hears nothing back, and SIGKILLs the whole thing — your drain logic never even ran. Exec form, the array syntax, makes your process PID 1 directly so it actually receives the signal it's supposed to handle.

**Host:** So it's the same pattern every time — nobody explicitly decided the behavior, so you get whatever the kernel or the daemon does by default. Is that the same story behind containers running as root, wide-open egress, pulling 'latest', secrets sitting in build args?

---

## 4. Where Docker's guarantees stop

**Guest:** Exactly the same story, and it's worth saying plainly: every one of those is a default nobody chose, not a design goal. The daemon doesn't have an opinion, so you inherit whatever's easiest to implement, not whatever's safest to run. That's the whole lesson of treating a container as a restricted process instead of a magic box — the restrictions are only the ones you actually asked for.

**Host:** And that's also where a single container's promises just run out — one process, one lifecycle, one image can't tell you how to schedule across machines, enforce resource limits, or roll out safely, that's a different layer entirely. So if you want the rest of the story, that's Kubernetes and the cloud modules — scheduling, drains done right, registries and scanning. For now, the mental model stands: it's not a tiny VM, it's a process with guardrails, and every mystery we covered today was just that guardrail, or the absence of one. Thanks for walking through it.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A live demo of building and running a Dockerfile step by step
- Comparing Docker to other container runtimes like Podman or containerd
- Docker Compose or multi-container local development workflows
