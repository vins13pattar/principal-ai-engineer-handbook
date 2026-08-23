# ADR-0001: Why the Handbook Runs on Astro + Starlight

_A hand-written HTML site couldn't scale to hundreds of pages over years, so the project needed a real content platform — and the tradeoffs among the candidates pointed clearly at Astro + Starlight._

- **Source:** [adr:0001-astro-starlight-platform](/adr/decisions/0001-astro-starlight-platform/)
- **Runtime:** 2:58 · 8 turns · 3 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The problem with hand-written HTML at scale

**Host:** So let's start at the beginning: why does a documentation project even need an architecture decision record for its own website? Walk us through what this handbook actually looked like before any of this.

**Guest:** It started as hand-written HTML — an index.html, a folder per module, each with its own index.html, plain CSS and a little JS. That's totally fine for two modules, but there's no content model, no search, no versioning, and every single new page means re-writing navigation, head tags, and responsive layout by hand again. The project's actual goal is to become the reference documentation system for Principal AI Engineers over years and hundreds of pages, so whatever we picked had to hold up at that scale, not just look okay for the first ten pages.

---

## 2. Weighing the framework field

**Host:** So static HTML was out. What else did the project actually put on the table before landing on Astro and Starlight?

**Guest:** Three real contenders. Docusaurus is the obvious mature choice, plugin-rich and React-based, but that React-everywhere model means a heavier runtime and slower builds than Astro's island architecture, which is a bad trade for a site that's mostly static content. Then VitePress and Nextra, both fast, both fine for API-reference docs, but neither has the ecosystem this project needs around ADR templates, printable cheat sheets, or a shared component library across a monorepo of labs.

**Host:** And Astro plus Starlight cleared all three of those bars at once?

**Guest:** Pretty much — Astro ships zero JS by default and only hydrates the specific components that need interactivity, like the theme toggle or the Mermaid renderer, so it stays fast even as the page count grows. Starlight layers content collections with Zod schema validation, Pagefind search, dark mode, and an accessible component set right on top of that, which is more docs-framework completeness than VitePress or Nextra offer out of the box. And since the two projects version in lockstep, we weren't betting on a fragile pairing.

---

## 3. The decision and what it costs going forward

**Host:** So let's land the plane — what did the team actually commit to, and where does it bite them later?

**Guest:** Astro 7 with Starlight, content in the docs collection validated by a schema, and a Tailwind v4 theme layered over Starlight's CSS variables for the custom look. The cost is real: a missing frontmatter field now fails the build instead of shipping, search and nav and dark mode are inherited rather than hand-tuned, and anything that isn't a folder of Markdown with frontmatter needs a custom page outside the collection — which is exactly what ADR-0004 has to solve for new content types. But it's accepted, it's live, and it's the site you're reading this on.
