# Contributing

Thanks for considering a contribution. This repository is a monorepo: a documentation platform
(`apps/handbook`, `packages/*`), production labs (`labs/*`), and the tooling that ties them
together.

## Before you start

- **Platform changes** (Astro/Starlight config, components, design tokens, CI): open an issue
  first if the change is structural — sidebar layout, content schema, deployment. Bug fixes and
  small improvements can go straight to a PR.
- **Content changes** (new Learn module, Architecture page, ADR, ...): follow
  [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md) for frontmatter and required sections. A PR
  adding an incomplete module (missing required sections) will fail CI's `pnpm lint:content` check
  by design — see [ADR-0004](https://principal-ai-engineer-handbook.pages.dev/adr/decisions/0004-single-docs-collection-schema/)
  for why that's a separate check from the build.
- **Lab changes** (`labs/*`): each lab is an independent Python project with its own tests and CI
  workflow. Follow the existing lab's conventions (ruff, mypy, pytest) rather than introducing new
  ones.

## Development setup

```bash
pnpm install
pnpm dev
```

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the full command reference.

## Before opening a PR

```bash
pnpm verify
```

This runs the same lint, format, typecheck, content-structure, test, and build steps as
[`.github/workflows/site-ci.yml`](.github/workflows/site-ci.yml). A lab change should additionally
pass that lab's own checks (e.g. `cd labs/async-ai-gateway && ruff check . && mypy src && pytest`).

## Commit style

Small, focused commits with a Conventional-Commits-style prefix (`feat:`, `fix:`, `docs:`,
`build:`, `test:`, ...) — consistent with this repository's existing history.

## Code of conduct

Be direct and be kind. Disagreements about architecture and content are expected and welcome;
personal attacks are not.
