# Principal AI Engineer Handbook

[![Site CI](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/site-ci.yml/badge.svg)](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/site-ci.yml)
[![Async AI Gateway CI](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/lab-async-ai-gateway-ci.yml/badge.svg)](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/lab-async-ai-gateway-ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Deployed to Cloudflare as a Worker with static assets — every push to
`main` and every pull request gets its own build and preview URL. See
[ADR-0007](apps/handbook/src/content/docs/adr/decisions/0007-workers-static-assets-deployment.mdx)
and [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md#deployment) for the Cloudflare project settings.

An open-source knowledge system for Principal AI Engineers: production architecture reference,
hands-on labs built to a production bar, and interview preparation grounded in that same material —
not interview notes with a coat of paint.

**[Read the handbook →](https://handbook.vinodspattar.in/)**

## What's here

| Section                                                        | What it is                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Learn](https://handbook.vinodspattar.in/learn/)               | Fifteen modules, Principal Engineer mindset through leadership      |
| [Build](https://handbook.vinodspattar.in/build/)               | Production-quality labs in [`labs/`](labs/)                         |
| [Architecture](https://handbook.vinodspattar.in/architecture/) | Reference architectures for recurring AI infrastructure problems    |
| [Interview](https://handbook.vinodspattar.in/interview/)       | Interview questions embedded next to the material that answers them |
| [Reference](https://handbook.vinodspattar.in/reference/)       | One-page lookups for tools and primitives                           |
| [ADR](https://handbook.vinodspattar.in/adr/)                   | Why the platform and its labs are built the way they are            |
| [Cheat Sheets](https://handbook.vinodspattar.in/cheatsheets/)  | Printable, one-page summaries                                       |
| [Roadmap](https://handbook.vinodspattar.in/roadmap/)           | Current version and what ships next                                 |

## Status

**Fourteen Learn modules, seven labs, seven architecture pages, two interview tracks.** Every lab
has a matching architecture page and a matching module, all cross-linked; every lab passes `ruff`,
`mypy --strict`, and its own test suite in CI. Reference has opened with its first lookups.
Leadership material and the remaining lookups are still being written — the
[Roadmap](https://handbook.vinodspattar.in/roadmap/) says what does not exist yet.

## Repository structure

```text
apps/handbook/       Astro + Starlight documentation site
packages/ui/         Brand design tokens (Tailwind v4 theme)
packages/components/ Reusable MDX doc components
packages/diagrams/   Client-side Mermaid diagram component
packages/shared/     Content schemas, versioning types, structural content linter
labs/                Production-quality labs (independent Python projects)
docs/                Contributor-facing guides (content authoring, local development)
legacy/              Retired static-HTML prototype, kept for migration reference
scripts/             Repo-level tooling (content structure lint)
.github/workflows/   CI (lint, typecheck, test, build, e2e) — deployment is Cloudflare, not Actions
```

## Local development

```bash
pnpm install
pnpm dev      # http://localhost:4321
```

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the full command reference and
[`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md) for how to write a new page.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE)

## Author

**Vinod Pattar** — Principal Engineer, AI Platform & Full-Stack Architecture
