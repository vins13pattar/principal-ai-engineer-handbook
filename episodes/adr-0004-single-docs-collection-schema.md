# ADR-0004: One Schema, One Linter

_Starlight forces every doc into a single content collection, so validation strictness has to be split between a permissive build-time schema and a separate structural linter that actually enforces per-section rules._

- **Source:** [adr:0004-single-docs-collection-schema](/adr/decisions/0004-single-docs-collection-schema/)
- **Runtime:** 3:56 · 8 turns · 3 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The mismatch between seven content types and one collection

**Host:** So today we're digging into ADR-0004, which is basically about a headache anyone using Starlight for a big docs site eventually hits. You've got seven totally different kinds of documents in this project — ADRs, Learn modules, Build, Architecture pages, Interviews, Reference, Cheat Sheets — and each one wants its own frontmatter and its own required sections. An ADR needs an adrNumber and adrStatus and a Status through References structure, while a Learn module needs a moduleNumber, a difficulty rating, and fifteen separate required sections. Totally different shapes.

**Guest:** Right, and the wrinkle is that Starlight only gives you one schema per content collection, and this whole site runs on a single docs collection. There's no built-in way to say 'this subfolder gets these fields, that subfolder gets those.' So you're stuck: either force every single page to satisfy the union of all seven types' requirements, which means meaningless placeholder fields on pages that don't need them, or you split into multiple collections and lose the sidebar and pagination behavior Starlight gives you for free. Neither of those is a real answer, which is exactly why this ADR exists.

---

## 2. Permissive schema at build time, strict linter in CI

**Host:** So how do you actually resolve that fork without giving up on either side? What did the ADR land on?

**Guest:** The trick is splitting where strictness lives. The Starlight schema in content.config.ts stays permissive — it's the base schema plus every section-specific field, but everything's optional or defaulted at the Zod level. So the build only rejects frontmatter that's actually broken, like a wrong type or an invalid enum, never a page for skipping a field that doesn't apply to it.

**Host:** And the real contract, the one that says an ADR needs a decision section and a module needs certain fields, that lives somewhere else entirely?

**Guest:** Exactly, it's written once in packages/shared/src/schemas.ts as fully-required Zod schemas, and those same schemas back that package's own tests. Then scripts/lint-content-structure.ts runs in CI, knows the required sections per directory — learn modules, architecture systems, ADR decisions — and checks real content against that stricter contract, completely separate from the build.

---

## 3. Living with two systems and duplicated schemas

**Host:** So walk me through what you're actually accepting by living with two systems. I get that overview pages like learn/index or adr/index can skip fields that only matter for the numbered pages underneath — that seems like a clean win.

**Guest:** That's exactly the tradeoff, which is why pnpm ci always runs both — build and lint:content — so nobody gets to rely on green build alone. The upside is the canonical shape of each content type lives in exactly one documented place, packages/shared/src/schemas.ts, that a Node script or even an editor integration could import later. And yes, that means two schema definitions, the Astro extend schema and the shared per-type ones, overlap and have to be kept in sync by hand — but that's deliberate, because sharing one Zod instance across Astro's content layer and plain Node tooling would couple both to whatever zod version happens to be installed where, and silent instanceof mismatches across duplicate zod installs is a genuinely worse failure mode than a small hand-maintained duplication you can actually see in a diff. That's the whole ADR in one sentence, really: split the strictness, document the shape once, and accept a bit of manual sync as the price of not coupling two tools to one shifting dependency.
