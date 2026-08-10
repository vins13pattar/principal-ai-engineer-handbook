import { z } from "zod";
import {
  ADR_STATUSES,
  ARCHITECTURE_MATURITY,
  DIFFICULTY_LEVELS,
  LAB_STATUSES,
} from "./constants.ts";

/**
 * Every page in the handbook carries a revision history entry per change.
 * `version` follows the page's own semver (independent of the site release).
 */
export const revisionHistoryEntrySchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver, e.g. 0.1.0"),
  date: z.coerce.date(),
  change: z.string().min(1),
  author: z.string().optional(),
});

export type RevisionHistoryEntry = z.infer<typeof revisionHistoryEntrySchema>;

/** Fields every content type in the handbook must declare, per the versioning policy in docs/CONTENT_GUIDE.md. */
export const baseDocSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver, e.g. 0.1.0"),
  lastUpdated: z.coerce.date(),
  revisionHistory: z.array(revisionHistoryEntrySchema).min(1),
  draft: z.boolean().default(false),
});

export type BaseDoc = z.infer<typeof baseDocSchema>;

export const learnModuleSchema = baseDocSchema.extend({
  moduleNumber: z.number().int().min(0).max(99),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  estimatedMinutes: z.number().int().positive(),
  prerequisites: z.array(z.string()).default([]),
  relatedLabs: z.array(z.string()).default([]),
});

export type LearnModule = z.infer<typeof learnModuleSchema>;

export const labDocSchema = baseDocSchema.extend({
  repoPath: z.string().min(1),
  stack: z.array(z.string()).min(1),
  status: z.enum(LAB_STATUSES),
  difficulty: z.enum(DIFFICULTY_LEVELS),
});

export type LabDoc = z.infer<typeof labDocSchema>;

export const architectureDocSchema = baseDocSchema.extend({
  maturity: z.enum(ARCHITECTURE_MATURITY),
  relatedAdrs: z.array(z.string()).default([]),
});

export type ArchitectureDoc = z.infer<typeof architectureDocSchema>;

export const adrDocSchema = baseDocSchema.extend({
  adrNumber: z.number().int().positive(),
  status: z.enum(ADR_STATUSES),
  supersededBy: z.number().int().positive().optional(),
});

export type AdrDoc = z.infer<typeof adrDocSchema>;

export const referenceDocSchema = baseDocSchema.extend({
  category: z.string().min(1),
});

export type ReferenceDoc = z.infer<typeof referenceDocSchema>;

export const cheatsheetDocSchema = baseDocSchema.extend({
  printable: z.boolean().default(true),
});

export type CheatsheetDoc = z.infer<typeof cheatsheetDocSchema>;

/**
 * Sections every Learn module must contain, in order, enforced by
 * scripts/lint-content-structure.ts against the rendered heading tree.
 */
export const REQUIRED_MODULE_SECTIONS = [
  "Executive Summary",
  "Mental Model",
  "Architecture",
  "Deep Dive",
  "Implementation",
  "Production Example",
  "Failure Modes",
  "Trade-offs",
  "Security",
  "Performance",
  "Scaling",
  "Interview Questions",
  "Hands-on Lab",
  "References",
  "Revision History",
] as const;

/** Sections every Architecture page must contain. */
export const REQUIRED_ARCHITECTURE_SECTIONS = [
  "Problem",
  "Requirements",
  "Constraints",
  "Request Flow",
  "Failure Modes",
  "Scaling",
  "Security",
  "Trade-offs",
  "Cost",
  "Observability",
  "Production Deployment",
  "Interview Questions",
] as const;

/**
 * Sections every Reference lookup must contain.
 *
 * Deliberately short. A lookup is opened mid-design-review to check one thing,
 * so the contract enforces the four questions that actually get asked of it —
 * what is this, what are the moving parts, what are the numbers, and what
 * catches people out — plus the route back into the material that goes deeper.
 * Anything longer belongs in a Learn module, not here.
 */
export const REQUIRED_REFERENCE_SECTIONS = [
  "At a Glance",
  "Key Concepts",
  "Numbers That Matter",
  "Common Gotchas",
  "Where to Go Deeper",
] as const;

/**
 * Sections every Cheat Sheet must contain.
 *
 * Cheat sheets are scoped to an *activity* under time pressure — a design
 * round, an incident — not to a technology. A per-technology summary would
 * duplicate a Reference lookup at lower fidelity, which is worth nothing to a
 * reader and doubles the maintenance surface. The contract enforces that shape:
 * when to reach for it, the order to work in, the values worth not deriving
 * under pressure, and what going wrong looks like.
 */
export const REQUIRED_CHEATSHEET_SECTIONS = [
  "Use This When",
  "The Sequence",
  "Quick Reference",
  "Red Flags",
] as const;

/** Sections every ADR must contain. */
export const REQUIRED_ADR_SECTIONS = [
  "Status",
  "Context",
  "Problem",
  "Options",
  "Decision",
  "Consequences",
  "References",
] as const;
