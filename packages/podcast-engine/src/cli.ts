/**
 * The operator entry point.
 *
 * Two commands that are not variations of each other: `plan` answers whether a
 * real model returns a draft this pipeline can use, and `create` produces a
 * playable episode. Only the first is implementable today, and `create`
 * refuses rather than pretending otherwise -- a command that names the
 * destination is what stops `plan` being mistaken for the product.
 *
 * Every dependency that touches the world -- the clock, the id suffix, the
 * model, the log sink -- is injected, so the whole `--run` path is testable
 * without a network.
 */

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { buildSourcePack, loadAllDocuments } from "@handbook/content";
import { createLlm, ModelResponseError } from "@handbook/podcast-providers";
import type { LlmPort } from "@handbook/podcast-providers";
import { parseConfig } from "./config.ts";
import { estimatePlanCost } from "./estimate.ts";
import { writeManifest } from "./manifest.ts";
import { buildPlanRequest, planEpisode } from "./plan.ts";
import { makeRunId, reserveRunDirectory, sanitiseSegment } from "./run.ts";

export interface CliDeps {
  cwd: string;
  env: Record<string, string | undefined>;
  now: () => Date;
  suffix: () => string;
  log: (line: string) => void;
  llm?: LlmPort;
}

const MISSING_STAGES = "dialogue, review, revision, voice script, synthesis, assembly";

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const command = argv[0];
  const documentId = argv[1];

  if (command !== "plan" && command !== "create") {
    deps.log("usage: cli.ts plan|create <documentId> --duration <seconds> [--run]");
    return 2;
  }
  if (documentId === undefined || documentId.startsWith("--")) {
    deps.log("a document id is required, e.g. module:06-mcp");
    return 2;
  }

  const durationRaw = flag(argv, "duration");
  const durationSeconds = Number(durationRaw);
  if (durationRaw === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    deps.log("--duration must be a number of seconds greater than zero");
    return 2;
  }

  // `create` refuses here: after argument validation, before anything is read
  // or spent. It cannot honestly estimate a pipeline whose stages do not exist.
  if (command === "create") {
    deps.log(`create is not implemented: it needs ${MISSING_STAGES}.`);
    deps.log("`plan` is available and validates the planning stage against a real model.");
    return 1;
  }

  const configPath = flag(argv, "config") ?? join(deps.cwd, "podcast.config.json");
  let config;
  try {
    config = parseConfig(JSON.parse(await readFile(configPath, "utf8")));
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const wantsRun = argv.includes("--run");
  const apiKey = deps.env["PODCAST_LLM_API_KEY"];
  if (wantsRun && (apiKey === undefined || apiKey === "")) {
    deps.log("PODCAST_LLM_API_KEY is required with --run");
    return 2;
  }

  let documentSegment: string;
  try {
    documentSegment = sanitiseSegment(documentId);
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 2;
  }

  let pack;
  try {
    const documents = await loadAllDocuments(deps.cwd);
    pack = buildSourcePack(documents, documentId);
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const { request } = buildPlanRequest(pack, { maxOutputTokens: config.llm.maxOutputTokens });
  const breakdown = estimatePlanCost(request, config.prices, config.llm.maxOutputTokens);

  deps.log(
    `  pack            ${pack.excerpts.length} excerpts, ~${breakdown.inputTokens} est. input tokens`,
  );
  deps.log(`  model           ${config.llm.provider}:${config.llm.modelId}`);
  deps.log("");
  deps.log(
    `  input (est.)    ${breakdown.inputTokens} tok   $${breakdown.inputCost.toFixed(4)}   estimated, NOT capped`,
  );
  deps.log(
    `  output (cap)    ${breakdown.maxOutputTokens} tok   $${breakdown.maxOutputCost.toFixed(4)}   enforced via maxOutputTokens`,
  );
  deps.log(`  estimated at max output       $${breakdown.estimatedAtMaxOutput.toFixed(4)}`);
  deps.log("");
  deps.log("  input is an approximation and can exceed this; only output is capped");
  deps.log("  covers          plan only");
  deps.log(`  excludes        ${MISSING_STAGES} — these stages are not implemented`);

  if (!wantsRun) {
    deps.log("");
    deps.log("  (estimate only — pass --run to call the model)");
    return 0;
  }

  const outRoot = flag(argv, "out") ?? join(deps.cwd, ".podcast");
  const root = isAbsolute(outRoot) ? outRoot : join(deps.cwd, outRoot);
  const runId = makeRunId(deps.now(), deps.suffix());
  const startedAt = deps.now().toISOString();

  let directory: string;
  try {
    directory = await reserveRunDirectory(root, documentSegment, runId);
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const llm =
    deps.llm ??
    createLlm(config.llm.provider as "openai" | "anthropic", {
      apiKey: apiKey as string,
      modelId: config.llm.modelId,
    });

  const common = {
    manifestVersion: 1 as const,
    command: "plan" as const,
    documentId,
    runId,
    startedAt,
    request: { durationSeconds },
    resolvedConfig: config,
  };

  try {
    const { plan, usage, modelId } = await planEpisode(
      pack,
      {
        requestedSeconds: durationSeconds,
        expansionFactor: config.plan.expansionFactor,
        charsPerSecond: config.tts.charsPerSecond,
        maxRenderSeconds: config.plan.maxRenderSeconds,
        synthesisCost: config.tts.synthesisCost,
      },
      llm,
      { maxOutputTokens: config.llm.maxOutputTokens },
    );

    await writeFile(join(directory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const measured =
      (usage.inputTokens / 1_000_000) * config.prices.inputPerMillionTokens +
      (usage.outputTokens / 1_000_000) * config.prices.outputPerMillionTokens;

    await writeManifest(directory, {
      ...common,
      status: "complete",
      finishedAt: deps.now().toISOString(),
      source: {
        sourceHash: pack.sourceHash,
        excerptCount: pack.excerpts.length,
        droppedForBudget: pack.droppedForBudget,
      },
      model: { modelId },
      usage,
      cost: { estimatedAtMaxOutput: breakdown.estimatedAtMaxOutput, measured },
      artifacts: ["plan.json", "manifest.json"],
    });

    deps.log("");
    deps.log(`  wrote ${directory}`);
    return 0;
  } catch (error) {
    const artifacts = ["manifest.json"];
    if (error instanceof ModelResponseError) {
      // The raw text is the only thing that makes this diagnosable, and it is
      // the reason the provider layer translates the SDK's error at all.
      await writeFile(
        join(directory, "failure.json"),
        `${JSON.stringify(
          { rawText: error.rawText, finishReason: error.finishReason, usage: error.usage },
          null,
          2,
        )}\n`,
      );
      artifacts.unshift("failure.json");
    }

    await writeManifest(directory, {
      ...common,
      status: "failed",
      finishedAt: deps.now().toISOString(),
      failure: { stage: "plan", message: error instanceof Error ? error.message : String(error) },
      source: {
        sourceHash: pack.sourceHash,
        excerptCount: pack.excerpts.length,
        droppedForBudget: pack.droppedForBudget,
      },
      cost: { estimatedAtMaxOutput: breakdown.estimatedAtMaxOutput, measured: null },
      artifacts,
    });

    deps.log("");
    deps.log(`  failed — diagnostics in ${directory}`);
    return 1;
  }
}

// Only runs when invoked directly, so the module stays importable by tests.
if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")
) {
  const code = await runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    now: () => new Date(),
    suffix: () => Math.random().toString(16).slice(2, 8),
    log: (line: string) => console.log(line),
  });
  process.exit(code);
}
