# ADR-0002: Why pnpm Workspaces for Site, Packages, and Labs

_A single-maintainer OSS platform needs shared conventions across its docs site and component packages without sharing a build — and without dragging Python labs into a Node toolchain they don't belong in._

- **Source:** [adr:0002-pnpm-monorepo-layout](/adr/decisions/0002-pnpm-monorepo-layout/)
- **Runtime:** 3:29 · 6 turns · 3 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. Three kinds of code, one problem

**Host:** Welcome back. Today we're digging into ADR-0002, which is really about the shape of a single-maintainer OSS platform before we even get to the tooling decision. There's the handbook site itself, there are the reusable pieces it leans on like design tokens and MDX components, and then there's this whole separate world of Python labs that the docs reference but don't build with.

**Guest:** Right, and one of those labs is important to call out — the async AI gateway example wasn't born inside this repo, it was already its own standalone Python project with its own CI before the platform showed up. So you've got three kinds of code that all need to feel coherent to a solo maintainer, but they absolutely should not share a build. The real question driving this decision is how to let a shared component change without forcing a publish-and-bump cycle every time, while the labs just keep doing their own Python thing untouched.

---

## 2. Weighing the layouts

**Host:** So walk me through the actual options you weighed here, because I imagine separate repos was the first instinct — it's the classic clean-boundaries move. Why didn't that hold up?

**Guest:** It's clean right up until you need a cross-cutting change, like a new doc component the site and some future second app both need — then you're publishing a package and bumping a version just to unblock yourself, alone, with no one else's PRs to coordinate against. The next option, a flat repo with relative imports like dot-dot-slash packages slash ui slash src, is even more tempting because it's zero setup, and it actually works fine until a package needs its own package.json or its own test runner — then that missing workspace tooling turns into friction on every single addition. That's what pushed me to a pnpm workspace, with labs deliberately left out of it since it's Python and shouldn't be something this workspace's tooling ever tries to build.

---

## 3. The decision and its trade-offs

**Host:** So the actual decision landed exactly where you were pointing: a pnpm workspace with pnpm-workspace.yaml covering apps and packages, workspace-star dependencies between them, and labs pointedly living outside all of that with its own pyproject.toml, pytest, ruff, mypy, and its own CI job. What does that buy you day to day?

**Guest:** The concrete payoff is that a change to packages slash components shows up in apps slash handbook on the next dev server reload — no publish, no version bump, no registry round trip. Root config for ESLint, Prettier, Vitest, and the base TypeScript setup is defined once and extended per package, so a fourth package means adding a package.json and a tsconfig that extends the root, not re-deriving lint rules from scratch, and pnpm's content-addressable store keeps node\_modules sane across packages that all share Astro and TypeScript instead of duplicating that tree everywhere. The one honest cost is that someone who only wants the Python labs still clones the whole repository — there's no slicing that out — but since the whole point of this project is that the platform and the labs are meant to be read together, that's a cost I accepted going in, not something I overlooked.
