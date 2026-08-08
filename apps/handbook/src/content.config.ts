import {
  ADR_STATUSES,
  ARCHITECTURE_MATURITY,
  DIFFICULTY_LEVELS,
  FRESHNESS_CLASSIFICATIONS,
  LAB_STATUSES,
} from "@handbook/shared";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection, z } from "astro:content";

/**
 * Starlight's `docs` collection covers every section (Learn, Build,
 * Architecture, Interview, Reference, ADR, Cheat Sheets, Roadmap) with one
 * shared schema, so every field below is optional here even though a given
 * section requires a subset of them in practice. That stricter, per-section
 * contract is expressed and enforced separately:
 *
 * - `packages/shared/src/schemas.ts` documents the canonical shape per
 *   content type (learn module, lab, architecture doc, ADR, ...) for tooling
 *   that runs outside Astro's build (tests, editor tooling).
 * - `scripts/lint-content-structure.ts` walks these directories in CI and
 *   fails the build if a page is missing required frontmatter or required
 *   sections for its content type.
 *
 * Keeping the two in sync is a deliberate trade-off: a single Zod instance
 * shared across both would couple Astro's content layer to whichever zod
 * version this workspace happens to install, which is worse long-term than
 * duplicating a handful of field definitions.
 */
const versioningFields = {
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "version must be semver, e.g. 0.1.0")
    .optional(),
  lastUpdated: z.coerce.date().optional(),
  revisionHistory: z
    .array(
      z.object({
        version: z.string(),
        date: z.coerce.date(),
        change: z.string(),
        author: z.string().optional(),
      }),
    )
    .optional(),
};

/**
 * How fast this page's subject matter moves, and what it was last checked
 * against. Separate from `lastUpdated` because editorial age and subject-matter
 * volatility are different things — see `packages/shared/src/freshness.ts`.
 * `scripts/lint-content-structure.ts` requires this block on fast-moving pages
 * and fails CI once a page passes its review window.
 */
const freshnessFields = {
  freshness: z
    .object({
      classification: z.enum(FRESHNESS_CLASSIFICATIONS),
      verifiedAgainst: z.string().optional(),
      verifiedOn: z.coerce.date().optional(),
      reviewAfterDays: z.number().int().positive().optional(),
    })
    .optional(),
};

const learnFields = {
  moduleNumber: z.number().int().min(0).optional(),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  prerequisites: z.array(z.string()).default([]),
  relatedLabs: z.array(z.string()).default([]),
};

const buildFields = {
  repoPath: z.string().optional(),
  stack: z.array(z.string()).optional(),
  labStatus: z.enum(LAB_STATUSES).optional(),
};

const architectureFields = {
  maturity: z.enum(ARCHITECTURE_MATURITY).optional(),
  relatedAdrs: z.array(z.number().int().positive()).default([]),
};

const adrFields = {
  adrNumber: z.number().int().positive().optional(),
  adrStatus: z.enum(ADR_STATUSES).optional(),
  supersededBy: z.number().int().positive().optional(),
};

const referenceFields = {
  category: z.string().optional(),
};

const cheatsheetFields = {
  printable: z.boolean().default(true),
};

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        ...versioningFields,
        ...freshnessFields,
        ...learnFields,
        ...buildFields,
        ...architectureFields,
        ...adrFields,
        ...referenceFields,
        ...cheatsheetFields,
      }),
    }),
  }),
};
