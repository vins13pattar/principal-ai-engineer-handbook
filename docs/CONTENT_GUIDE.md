# Content authoring guide

This is the practical reference for adding a page to the handbook. For _why_ the content model is
shaped this way, see the ADRs in [`/adr/`](https://principal-ai-engineer-handbook.pages.dev/adr/),
especially [ADR-0004](https://principal-ai-engineer-handbook.pages.dev/adr/decisions/0004-single-docs-collection-schema/).

## Where a page lives

All content lives under `apps/handbook/src/content/docs/`, one directory per section:

| Section      | Directory       | Numbered pages go in    |
| ------------ | --------------- | ----------------------- |
| Learn        | `learn/`        | `learn/modules/`        |
| Build        | `build/`        | `build/labs/`           |
| Architecture | `architecture/` | `architecture/systems/` |
| Interview    | `interview/`    | `interview/tracks/`     |
| Reference    | `reference/`    | `reference/lookups/`    |
| ADR          | `adr/`          | `adr/decisions/`        |
| Cheat Sheets | `cheatsheets/`  | `cheatsheets/sheets/`   |

Each section's `index.mdx` is its overview page, rendered at the section root (e.g.
`learn/index.mdx` → `/learn/`). New content pages go in the numbered subdirectory, and the sidebar
picks them up automatically (`autogenerate` in `apps/handbook/astro.config.mjs`) — no manual nav
edit required.

## Every page needs these frontmatter fields

```yaml
---
title: Page title
description: One sentence, used for the meta description and search results.
version: 1.0.0 # semver for this page, independent of the site's own version
lastUpdated: 2026-08-04
revisionHistory:
  - version: 1.0.0
    date: 2026-08-04
    change: What changed in this revision.
    author: your-name
---
```

`scripts/lint-content-structure.ts` doesn't check these directly (Starlight's build-time schema in
`apps/handbook/src/content.config.ts` does), but every page should have them — they drive the
"last updated" badge, the homepage's "Latest" lists, and this project's whole premise that content
is versioned, not just written once.

## Section-specific frontmatter and required sections

Adding these fields is optional at the schema level but required by
`scripts/lint-content-structure.ts` (run via `pnpm lint:content`) for the sections it checks today
(Learn modules, Architecture systems, ADRs — see `CHECKED_SECTIONS` in the script to extend it to a
new section).

### Learn module (`learn/modules/*.mdx`)

```yaml
moduleNumber: 1
difficulty: intermediate # foundational | intermediate | advanced | expert
estimatedMinutes: 45
prerequisites: [] # slugs of modules to read first
relatedLabs: [] # e.g. ["async-ai-gateway"]
```

Required `##` sections, in order: Executive Summary, Mental Model, Architecture, Deep Dive,
Implementation, Production Example, Failure Modes, Trade-offs, Security, Performance, Scaling,
Interview Questions, Hands-on Lab, References, Revision History.

### Architecture (`architecture/systems/*.mdx`)

```yaml
maturity: reference # reference | battle-tested | emerging
relatedAdrs: [] # ADR numbers, e.g. [3]
```

Required sections: Problem, Requirements, Constraints, Request Flow, Failure Modes, Scaling,
Security, Trade-offs, Cost, Observability, Production Deployment, Interview Questions.

### ADR (`adr/decisions/*.mdx`)

```yaml
adrNumber: 5
adrStatus: proposed # proposed | accepted | deprecated | superseded
supersededBy: 8 # only if adrStatus is "superseded"
```

Required sections: Status, Context, Problem, Options, Decision, Consequences, References. Start
`<ADRSummary adrNumber={5} status="proposed" date={new Date("2026-09-01")} />` right after the
frontmatter so the status badge and the `## Status` section agree — the linter checks the section
heading exists, not that it matches the component prop, so keep them in sync by hand.

### Build / lab (`build/labs/*.mdx`)

```yaml
category: lab
repoPath: labs/your-lab-name
stack: ["Python 3.12+", "FastAPI"]
labStatus: production-ready # planned | in-progress | production-ready
```

No fixed section list is enforced today — document the lab's architecture, request flow, what it
demonstrates, how to run and verify it, and its production-readiness gaps, in whatever structure
fits. Link back to the lab's own `PRODUCTION_READINESS.md` rather than duplicating it.

### Reference (`reference/lookups/*.mdx`) and Cheat Sheets (`cheatsheets/sheets/*.mdx`)

```yaml
category: Concurrency # Reference only
printable: true # Cheat Sheets only, defaults to true
```

## Using the shared components

Import from `@handbook/components` rather than writing ad hoc callout markup — see
`packages/components/src/index.ts` for the full list (`EngineeringNote`, `PrincipalPerspective`,
`TradeOff`, `Warning`, `FailureMode`, `InterviewQuestion`, `InterviewAnswer`, `CodeWalkthrough`,
`ResearchNote`, `ADRSummary`, `Exercise`, `LabCallout`, `Checklist`).

```mdx
import { TradeOff, InterviewQuestion } from "@handbook/components";

<TradeOff title="Fail-open vs. fail-closed">...</TradeOff>

<InterviewQuestion difficulty="advanced">...</InterviewQuestion>
```

## Diagrams

Keep Mermaid source in its own `.mmd` file next to the page and import it as raw text — do not put
diagram source in the component's slot (see the doc comment in
`packages/diagrams/src/Mermaid.astro` and [ADR-0003](https://principal-ai-engineer-handbook.pages.dev/adr/decisions/0003-client-side-mermaid-rendering/) for why).

```mdx
import Mermaid from "@handbook/diagrams/Mermaid.astro";
import flow from "./my-page.request-flow.mmd?raw";

<Mermaid code={flow} title="Descriptive, accessible title" />
```

## Internal links

The site has no base path — it deploys to a domain root on Cloudflare Pages (see
[ADR-0005](https://principal-ai-engineer-handbook.pages.dev/adr/decisions/0005-cloudflare-pages-deployment/)).
Write internal links root-relative, with no prefix:

```md
[Learn](/learn/)
```

`starlight-links-validator` fails the build on a broken internal link, so a mistake here is caught
in CI, not in production.

## Before opening a PR

```bash
pnpm lint:content   # required sections and frontmatter shape for checked content types
pnpm check          # Astro + TypeScript diagnostics, including frontmatter schema
pnpm build           # full production build, including the link validator
```

`pnpm verify` runs all of the above plus lint, formatting, and unit tests in one command — the same
sequence CI runs.
