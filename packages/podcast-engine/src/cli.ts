/**
 * The operator entry point.
 *
 * Two commands that are not variations of each other: `plan` answers whether a
 * real model returns a draft this pipeline can use, and `create` produces a
 * playable episode. `plan` exists on its own because it is the cheap half --
 * one model call, no synthesis -- and the half worth running when what you are
 * checking is whether the source material supports an episode at all.
 *
 * Every dependency that touches the world -- the clock, the id suffix, the
 * model, the voice, the log sink -- is injected, so the whole `--run` path is
 * testable without a network and without spawning a synthesis subprocess.
 */

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSourcePack, loadAllDocuments } from "@handbook/content";
import { ZERO_USAGE, addUsage, createLlm, createLocalTts } from "@handbook/podcast-providers";
import { ModelResponseError } from "@handbook/podcast-providers";
import type { LlmPort, PriceList, TtsPort, Usage } from "@handbook/podcast-providers";
import { CONFIG_TEMPLATE, parseConfig } from "./config.ts";
import type { PodcastConfig } from "./config.ts";
import { scriptCharacters } from "./dialogue.ts";
import { createEpisode } from "./create.ts";
import type { CreateStage } from "./create.ts";
import type { BeatReview } from "./review.ts";
import { estimateCreateCost, estimatePlanCost } from "./estimate.ts";
import { writeManifest } from "./manifest.ts";
import { beatsForSeconds, buildPlanRequest, planEpisode } from "./plan.ts";
import { makeRunId, reserveRunDirectory, sanitiseSegment } from "./run.ts";

export interface CliDeps {
  cwd: string;
  env: Record<string, string | undefined>;
  now: () => Date;
  suffix: () => string;
  log: (line: string) => void;
  llm?: LlmPort;
  tts?: TtsPort;
}

/** What `plan` does not do. Naming them is what stops `plan` reading as the product. */
const PLAN_EXCLUDES = "dialogue, review, synthesis, assembly";
/**
 * Every stage the designed pipeline has. `create` now runs all of them, so
 * there is no "excludes" line for it -- and printing one that named already
 * implemented stages was worse than printing nothing.
 */
const CREATE_COVERS = "plan, dialogue, review, revision, synthesis, assembly";

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

// The one place that turns measured usage into a dollar figure, so the success
// path and the failed-with-usage path can never compute it two different ways.
// Speech is in here rather than added by the caller: a local run prices it at
// zero, and a zero that is computed is a zero that keeps working when the
// provider is not local.
function measuredCost(usage: Usage, prices: PriceList): number {
  return (
    (usage.inputTokens / 1_000_000) * prices.inputPerMillionTokens +
    (usage.outputTokens / 1_000_000) * prices.outputPerMillionTokens +
    (usage.speechCharacters / 1_000_000) * prices.speechPerMillionCharacters
  );
}

function seconds(value: number | null): string {
  return value === null ? "unmeasured" : `${Math.round(value)}s`;
}

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const command = argv[0];
  const documentId = argv[1];

  if (command !== "plan" && command !== "create") {
    deps.log("usage: cli.ts plan|create <documentId> [--duration <seconds>] [--run]");
    return 2;
  }
  if (documentId === undefined || documentId.startsWith("--")) {
    deps.log("a document id is required, e.g. module:06-mcp");
    return 2;
  }

  // Optional, and defaulted from the page rather than from a number somebody
  // has to pick. The episode exists so a reader can listen instead of reading,
  // so the page's own reading time is the target; `--duration` is the override
  // for when you want something other than the whole page.
  const durationRaw = flag(argv, "duration");
  const requestedDuration = durationRaw === undefined ? undefined : Number(durationRaw);
  if (
    requestedDuration !== undefined &&
    (!Number.isFinite(requestedDuration) || requestedDuration <= 0)
  ) {
    deps.log("--duration must be a number of seconds greater than zero");
    return 2;
  }

  // Reading, parsing, and validating are three separately-failing steps, and
  // only the last one used to explain itself: `parseConfig`'s own error
  // embeds `CONFIG_TEMPLATE`, but a missing file or malformed JSON never
  // reached it, so those two guaranteed-first-run failures printed a bare
  // ENOENT or a bare parse error with no hint that a template exists.
  const configPath = flag(argv, "config") ?? join(deps.cwd, "podcast.config.json");

  let configText: string;
  try {
    configText = await readFile(configPath, "utf8");
  } catch (error) {
    const isMissing =
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";
    deps.log(error instanceof Error ? error.message : String(error));
    if (isMissing) {
      deps.log(`copy podcast.config.example.json to ${configPath} and fill it in.`);
    }
    deps.log("");
    deps.log(`Expected shape:\n${CONFIG_TEMPLATE}`);
    return 2;
  }

  let configJson: unknown;
  try {
    configJson = JSON.parse(configText);
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    deps.log("");
    deps.log(`Expected shape:\n${CONFIG_TEMPLATE}`);
    return 2;
  }

  let config: PodcastConfig;
  try {
    // `parseConfig`'s own thrown message already embeds `CONFIG_TEMPLATE`.
    config = parseConfig(configJson);
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const isCreate = command === "create";
  const wantsRun = argv.includes("--run");
  // Opt-out rather than opt-in: groundedness is the property the closed-set
  // design exists to protect, and a check nobody remembers to enable protects
  // nothing.
  const review = !argv.includes("--skip-review");
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

  const durationSeconds = requestedDuration ?? pack.readingSeconds;

  const { request } = buildPlanRequest(pack, {
    maxOutputTokens: config.llm.maxOutputTokens,
    requestedSeconds: durationSeconds,
  });
  const planCost = estimatePlanCost(request, config.prices, config.llm.maxOutputTokens);

  const createCost = isCreate
    ? estimateCreateCost(request, config.prices, {
        beats: beatsForSeconds(durationSeconds),
        characterBudget: Math.round(durationSeconds * config.tts.charsPerSecond),
        review,
      })
    : null;

  // `plan` still quotes a ceiling because for one call a ceiling is a real
  // bound. `create` quotes an expectation, because summing eleven generous
  // per-call caps produces a number nothing approaches -- see
  // `estimateCreateCost`.
  const estimated = createCost ? createCost.expected : planCost.estimatedAtMaxOutput;

  deps.log(
    `  pack            ${pack.excerpts.length} excerpts, ~${planCost.inputTokens} est. input tokens`,
  );
  deps.log(
    `  target          ${Math.round(durationSeconds / 60)} min` +
      (requestedDuration === undefined
        ? `   the page's reading time`
        : `   requested (the page reads in ${Math.round(pack.readingSeconds / 60)} min)`),
  );
  deps.log(`  model           ${config.llm.provider}:${config.llm.modelId}`);
  if (isCreate) {
    deps.log(
      `  voices          ${config.tts.voices.host} (host), ${config.tts.voices.guest} (guest) via ${config.tts.runner.name}`,
    );
  }
  deps.log("");

  if (createCost) {
    deps.log(
      // "if" rather than a flat count: the beat number is what the planner is
      // asked for, not what it returns, and nothing validates the answer. A
      // model that returns eight beats for a five-beat request makes half as
      // many calls again as this line promises.
      `  calls           ~${createCost.calls}: 1 plan + ${createCost.beats} dialogue${review ? ` + ${createCost.beats} review` : ""}, if the planner returns ${createCost.beats} beats`,
    );
    deps.log(
      `  input (est.)    ${createCost.inputTokens} tok   $${createCost.inputCost.toFixed(4)}   the pack reaches each stage`,
    );
    deps.log(
      `  output (exp.)   ${createCost.expectedOutputTokens} tok   $${createCost.expectedOutputCost.toFixed(4)}   ${review ? "the script, the overrun, and the beats review rewrites" : "the script and the overrun past its budget"}`,
    );
    deps.log(`  expected        $${createCost.expected.toFixed(4)}`);
    deps.log("");
    deps.log("  an expectation, not a ceiling: per-call caps exist to stop a runaway, not to");
    deps.log("  price the run. Models overrun the character budget, reliably and by a lot —");
    deps.log("  that costs output tokens, and makes the episode longer than requested.");
  } else {
    deps.log(
      `  plan input      ${planCost.inputTokens} tok   $${planCost.inputCost.toFixed(4)}   estimated, NOT capped`,
    );
    deps.log(
      `  plan output     ${planCost.maxOutputTokens} tok   $${planCost.maxOutputCost.toFixed(4)}   enforced via maxOutputTokens`,
    );
    deps.log(`  estimated at max output       $${estimated.toFixed(4)}`);
    deps.log("");
    deps.log("  input is an approximation and can exceed this; only output is capped");
  }

  if (isCreate) {
    const characters = Math.round(durationSeconds * config.tts.charsPerSecond);
    const speechCost = (characters / 1_000_000) * config.prices.speechPerMillionCharacters;
    deps.log(
      `  speech          ~${characters} chars   $${speechCost.toFixed(4)}   at the configured speech price`,
    );
    deps.log(
      `  render          local compute, not spend: ~${config.tts.synthesisCost.fixedSeconds}s per turn plus ${config.tts.synthesisCost.marginalRtf}x audio`,
    );
  }

  // This line has been wrong twice, both times by outliving a stage that got
  // built. It now derives from what the command runs rather than from a
  // hand-maintained list of what it does not.
  deps.log(
    `  covers          ${isCreate ? (review ? CREATE_COVERS : `${CREATE_COVERS} (review skipped)`) : "plan only"}`,
  );
  if (!isCreate) {
    deps.log(`  excludes        ${PLAN_EXCLUDES} — run \`create\` for those`);
  }

  if (!wantsRun) {
    deps.log("");
    deps.log("  (estimate only — pass --run to call the model)");
    return 0;
  }

  // Both ports are constructed before the directory is reserved, so a provider
  // that refuses to build fails with nothing written -- it is a validation
  // failure, not a run that died. Everything after reservation stays inside the
  // try below, which is what makes "every failure after reservation writes
  // diagnostics" true rather than nearly true.
  let llm: LlmPort;
  let tts: TtsPort | undefined;
  try {
    llm =
      deps.llm ??
      createLlm(config.llm.provider, {
        apiKey: apiKey as string,
        modelId: config.llm.modelId,
      });

    if (isCreate) {
      const runner = config.tts.runner;
      tts =
        deps.tts ??
        createLocalTts({
          name: runner.name,
          command: runner.command,
          args: runner.args,
          // Relative to where the operator ran the command, not to this file:
          // the configured "packages/podcast-providers" is written from the
          // repository root because that is where the CLI is invoked.
          ...(runner.cwd === undefined
            ? {}
            : { cwd: isAbsolute(runner.cwd) ? runner.cwd : join(deps.cwd, runner.cwd) }),
          ...(runner.mediaType === undefined ? {} : { mediaType: runner.mediaType }),
          ...(runner.timeoutSeconds === undefined ? {} : { timeoutSeconds: runner.timeoutSeconds }),
        });
    }
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 2;
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

  const common = {
    manifestVersion: 1 as const,
    command,
    documentId,
    runId,
    startedAt,
    request: { durationSeconds },
    resolvedConfig: config,
  };

  const source = {
    sourceHash: pack.sourceHash,
    excerptCount: pack.excerpts.length,
    droppedForBudget: pack.droppedForBudget,
  };

  // Accumulated as stages finish rather than collected at the end: a run that
  // dies in synthesis has still spent two model calls, and a manifest that
  // reports zero for them is a manifest that understates the bill.
  let usage: Usage = ZERO_USAGE;
  // Distinct from `usage` being all zeros. A stage that failed before reporting
  // leaves the bill genuinely unknown, and reporting an unknown as $0.0000
  // claims a measurement nobody took.
  let usageKnown = false;
  let modelId = config.llm.modelId;
  let stage: CreateStage = "plan";
  const artifacts: string[] = [];
  // Collected as reviews happen rather than from the result, so a run that
  // dies after them still records what they found and what they cost.
  const reviews: BeatReview[] = [];

  const basis = createCost ? ("expected" as const) : ("ceiling" as const);
  const reviewSummary = () => ({
    ran: review,
    beatsReviewed: reviews.filter((entry) => entry.reviewFailed === undefined).length,
    beatsRevised: reviews.filter((entry) => entry.revised).length,
    beatsLeftUnfixed: reviews.filter((entry) => entry.findings.length > 0 && !entry.revised).length,
    beatsNotChecked: reviews.filter((entry) => entry.reviewFailed !== undefined).length,
    droppedFindings: reviews.reduce((total, entry) => total + entry.droppedFindings, 0),
    findings: reviews.flatMap((entry) =>
      entry.findings.map((finding) => ({ beat: entry.beat, ...finding })),
    ),
  });

  try {
    if (isCreate) {
      if (tts === undefined) throw new Error("create requires a speech provider");

      const result = await createEpisode({
        pack,
        config,
        durationSeconds,
        generated: deps.now().toISOString().slice(0, 10),
        review,
        llm,
        tts,
        directory,
        onStageStart: (started) => {
          stage = started;
        },
        onStageDone: (_finished, report) => {
          if (report.usage) {
            usage = addUsage(usage, report.usage);
            usageKnown = true;
          }
          if (report.modelId) modelId = report.modelId;
          if (report.artifact) artifacts.push(report.artifact);
        },
        onReview: (entry) => reviews.push(entry),
        log: deps.log,
      });

      const measured = measuredCost(usage, config.prices);
      artifacts.push("manifest.json");

      await writeManifest(directory, {
        ...common,
        status: "complete",
        finishedAt: deps.now().toISOString(),
        source,
        model: { modelId },
        usage,
        cost: { estimatedAtMaxOutput: estimated, basis, measured },
        dialogue: {
          turns: result.script.turns.length,
          characters: scriptCharacters(result.script),
        },
        review: reviewSummary(),
        artifacts,
      });

      deps.log("");
      deps.log(
        `  episode         ${seconds(result.episode.audioSeconds)} of audio from ${result.script.turns.length} turns`,
      );
      deps.log(
        `  asked for       ${Math.round(durationSeconds)}s, planned ${Math.round(result.plan.plannedSeconds)}s`,
      );
      deps.log(`  render          ${Math.round(result.episode.elapsedSeconds)}s of local compute`);
      deps.log(
        `  measured        ${usage.inputTokens} in / ${usage.outputTokens} out tok, ${usage.speechCharacters} chars   $${measured.toFixed(4)}`,
      );
      deps.log(
        `  estimated       $${estimated.toFixed(4)}   (vs. measured $${measured.toFixed(4)})`,
      );
      deps.log("");
      deps.log(`  wrote ${join(directory, "episode.wav")}`);
      return 0;
    }

    const planned = await planEpisode(
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

    await writeFile(join(directory, "plan.json"), `${JSON.stringify(planned.plan, null, 2)}\n`);
    usage = planned.usage;
    modelId = planned.modelId;
    const measured = measuredCost(usage, config.prices);

    await writeManifest(directory, {
      ...common,
      status: "complete",
      finishedAt: deps.now().toISOString(),
      source,
      model: { modelId },
      usage,
      cost: { estimatedAtMaxOutput: estimated, basis, measured },
      artifacts: ["plan.json", "manifest.json"],
    });

    // The estimate is `estimatedAtMaxOutput`, not a promise -- reprinting the
    // measured figure beside it is how that gap becomes observable instead of
    // assumed away.
    deps.log("");
    deps.log(
      `  measured        ${usage.inputTokens} in / ${usage.outputTokens} out tok   $${measured.toFixed(4)}`,
    );
    deps.log(`  estimated       $${estimated.toFixed(4)}   (vs. measured $${measured.toFixed(4)})`);
    deps.log("");
    deps.log(`  wrote ${directory}`);
    return 0;
  } catch (error) {
    const failed = [...artifacts];
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
      failed.unshift("failure.json");
      if (error.usage) {
        usage = addUsage(usage, error.usage);
        usageKnown = true;
      }
    }
    failed.push("manifest.json");

    const measured = usageKnown ? measuredCost(usage, config.prices) : null;

    await writeManifest(directory, {
      ...common,
      status: "failed",
      finishedAt: deps.now().toISOString(),
      failure: { stage, message: error instanceof Error ? error.message : String(error) },
      source,
      model: { modelId },
      ...(usageKnown ? { usage } : {}),
      cost: { estimatedAtMaxOutput: estimated, basis, measured },
      // Recorded here too: the reviews before the failure were billed, and
      // their findings exist nowhere else once the run is over.
      ...(reviews.length > 0 ? { review: reviewSummary() } : {}),
      artifacts: failed,
    });

    deps.log("");
    deps.log(`  failed in ${stage} — diagnostics in ${directory}`);
    return 1;
  }
}

// Only runs when invoked directly, so the module stays importable by tests.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    now: () => new Date(),
    suffix: () => Math.random().toString(16).slice(2, 8),
    log: (line: string) => console.log(line),
  });
  process.exit(code);
}
