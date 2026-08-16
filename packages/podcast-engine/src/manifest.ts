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

const CompleteSchema = z.object({
  ...CommonSchema,
  status: z.literal("complete"),
  source: SourceSchema,
  model: z.object({ modelId: z.string() }),
  usage: UsageSchema,
  cost: z.object({ estimatedAtMaxOutput: z.number(), measured: z.number() }),
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
  cost: z.object({ estimatedAtMaxOutput: z.number(), measured: z.number().nullable() }).optional(),
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
