/**
 * The file that declares whether a run happened.
 *
 * A discriminated union on `status`, not a flat object with an optional
 * `failure`. A flat shape admits `complete` carrying a failure and `failed`
 * carrying none -- two states that should be unrepresentable in the one file
 * whose job is to say which occurred.
 *
 * Validated before it reaches disk, because a malformed manifest is
 * indistinguishable from a missing one to anything reading it, and a run with
 * no manifest is a run whose status is unknown.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const UsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  speechCharacters: z.number(),
});

const SourceSchema = z.object({
  sourceHash: z.string(),
  excerptCount: z.number(),
  droppedForBudget: z.array(z.string()),
});

const CommonSchema = {
  manifestVersion: z.literal(1),
  command: z.enum(["plan", "create"]),
  documentId: z.string(),
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  request: z.object({ durationSeconds: z.number() }),
  resolvedConfig: z.unknown().optional(),
  artifacts: z.array(z.string()),
};

/**
 * What the model wrote against what was spoken.
 *
 * Present only for `create`. `script.json` holds the full script and the audio
 * holds the cut one; without this block the difference between them is
 * invisible, and a listener wondering why a point stops mid-argument has
 * nowhere to look.
 */
const RenderedSchema = z.object({
  turnsWritten: z.number(),
  turnsRendered: z.number(),
  charactersWritten: z.number(),
  charactersRendered: z.number(),
  /** Indices into `script.json`'s turns that were not spoken. */
  droppedTurns: z.array(z.number()),
});

/**
 * What the review stage found, and whether it ran at all.
 *
 * `ran: false` is a distinct claim from zero findings: one says nobody checked,
 * the other says somebody checked and the episode was clean. A manifest that
 * could not tell them apart would make `--skip-review` invisible after the fact.
 */
const ReviewSchema = z.object({
  ran: z.boolean(),
  beatsReviewed: z.number(),
  beatsRevised: z.number(),
  /** Beats where review found problems and the fix did not land. */
  beatsLeftUnfixed: z.number(),
  /** Beats whose review call failed, leaving them unchecked. */
  beatsNotChecked: z.number(),
  /** Findings discarded for naming a turn the beat does not have. */
  droppedFindings: z.number(),
  findings: z.array(
    z.object({
      beat: z.number(),
      turn: z.number(),
      problem: z.string(),
      detail: z.string(),
    }),
  ),
});

/**
 * Which kind of number `estimatedAtMaxOutput` holds.
 *
 * `plan` quotes a ceiling and `create` an expectation, and they differ by
 * roughly two-fold. Without this, comparing estimate against measured across a
 * run history averages two incomparable quantities and reports the estimator
 * as far better than it is.
 */
const CostBasis = z.enum(["ceiling", "expected"]);

const CompleteSchema = z.object({
  ...CommonSchema,
  status: z.literal("complete"),
  dialogue: RenderedSchema.optional(),
  review: ReviewSchema.optional(),
  source: SourceSchema,
  model: z.object({ modelId: z.string() }),
  usage: UsageSchema,
  cost: z.object({ estimatedAtMaxOutput: z.number(), basis: CostBasis, measured: z.number() }),
  // A plain (non-`.strict()`) member of a `discriminatedUnion` does not reject
  // extra keys on the matched branch: `safeParse` on a "complete" object that
  // also carries a `failure` field succeeds unless something explicitly closes
  // that field. This closes only `failure` -- the one field whose presence
  // would make this manifest claim both outcomes at once -- without adopting
  // blanket `.strict()`, which would also block adding a field under a later
  // `manifestVersion`.
  failure: z.never().optional(),
});

const FailedSchema = z.object({
  ...CommonSchema,
  status: z.literal("failed"),
  failure: z.object({ stage: z.string(), message: z.string() }),
  source: SourceSchema.optional(),
  model: z.object({ modelId: z.string() }).optional(),
  usage: UsageSchema.optional(),
  review: ReviewSchema.optional(),
  cost: z
    .object({
      estimatedAtMaxOutput: z.number(),
      basis: CostBasis,
      measured: z.number().nullable(),
    })
    .optional(),
});

export const ManifestSchema = z.discriminatedUnion("status", [CompleteSchema, FailedSchema]);

export type Manifest = z.infer<typeof ManifestSchema>;

export async function writeManifest(directory: string, manifest: unknown): Promise<void> {
  const parsed = ManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error(`refusing to write an invalid manifest: ${parsed.error.message}`);
  }
  await writeFile(join(directory, "manifest.json"), `${JSON.stringify(parsed.data, null, 2)}\n`);
}
