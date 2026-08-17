import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSourcePack, loadAllDocuments } from "@handbook/content";
import { FakeLlm, FakeWavTts, wavDurationSeconds } from "@handbook/podcast-providers";
import { ModelResponseError } from "@handbook/podcast-providers";
import type { TtsPort } from "@handbook/podcast-providers";
import { runCli } from "./cli.ts";
import { CONFIG_TEMPLATE } from "./config.ts";
import { deriveExcerptIds } from "./ids.ts";
import { reserveRunDirectory } from "./run.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

let outRoot = "";
let configPath = "";
let lines: string[] = [];

const draft = {
  title: "What MCP standardises",
  throughLine: "MCP is a transport contract, not a capability.",
  beats: [{ title: "Open", intent: "Frame it", excerptIds: [] as string[], weight: 1 }],
  unsupported: [],
};

function deps(overrides: Record<string, unknown> = {}) {
  return {
    cwd: REPO_ROOT,
    env: { PODCAST_LLM_API_KEY: "test-key" } as Record<string, string | undefined>,
    now: () => new Date("2026-08-16T13:42:07.000Z"),
    suffix: () => "a3f9c1",
    log: (line: string) => lines.push(line),
    ...overrides,
  };
}

beforeEach(async () => {
  outRoot = await mkdtemp(join(tmpdir(), "podcast-cli-"));
  configPath = join(outRoot, "podcast.config.json");
  await writeFile(configPath, CONFIG_TEMPLATE.replace('"claude-..."', '"claude-test"'));
  lines = [];
});

afterEach(async () => {
  await rm(outRoot, { recursive: true, force: true });
});

const base = (extra: string[] = []) => [
  "plan",
  "module:06-mcp",
  "--duration",
  "2400",
  "--config",
  configPath,
  "--out",
  join(outRoot, "runs"),
  ...extra,
];

describe("runCli — dry plan", () => {
  it("prints an estimate, writes nothing, and exits zero", async () => {
    // A dry run is a success that writes nothing. A directory holding only an
    // estimate would be an artifact implying work that did not happen.
    const llm = new FakeLlm([draft]);

    const code = await runCli(base(), deps({ llm }));

    expect(code).toBe(0);
    expect(llm.calls).toHaveLength(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
    expect(lines.join("\n")).toMatch(/estimated at max output/i);
  });

  it("names what it excludes", async () => {
    await runCli(base(), deps({ llm: new FakeLlm([draft]) }));

    const output = lines.join("\n");
    expect(output).toMatch(/dialogue/);
    expect(output).toMatch(/not implemented/);
  });

  it("runs without a credential", async () => {
    // The estimate path must work in CI, or for someone without a key.
    const code = await runCli(base(), deps({ env: {}, llm: new FakeLlm([draft]) }));

    expect(code).toBe(0);
  });
});

describe("runCli — pre-reservation failures", () => {
  it.each([
    ["missing duration", ["plan", "module:06-mcp", "--config", configPath]],
    [
      "non-numeric duration",
      ["plan", "module:06-mcp", "--duration", "abc", "--config", configPath],
    ],
    ["zero duration", ["plan", "module:06-mcp", "--duration", "0", "--config", configPath]],
    [
      "unknown document",
      ["plan", "nope:nope", "--duration", "2400", "--config", configPath, "--run"],
    ],
    ["invalid command", ["render", "module:06-mcp", "--duration", "2400", "--config", configPath]],
    ["missing document id", ["plan", "--duration", "2400", "--config", configPath]],
  ] as Array<[string, string[]]>)("leaves the output root untouched: %s", async (_label, argv) => {
    const llm = new FakeLlm([draft]);

    const code = await runCli([...argv, "--out", join(outRoot, "runs")], deps({ llm }));

    expect(code).not.toBe(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
  });

  it("refuses --run with no credential, before any call", async () => {
    const llm = new FakeLlm([draft]);

    const code = await runCli(base(["--run"]), deps({ env: {}, llm }));

    expect(code).not.toBe(0);
    expect(llm.calls).toHaveLength(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
  });
});

// Config is one of the five pre-reservation stages -- readFile, JSON.parse,
// and parseConfig each fail differently, and `beforeEach` writes a valid
// config for every other test in this file, so none of them exercise this
// stage at all.
describe("runCli — config failures", () => {
  it("refuses a config path that does not exist", async () => {
    const missingConfigPath = join(outRoot, "does-not-exist.json");

    const code = await runCli(
      [
        "plan",
        "module:06-mcp",
        "--duration",
        "2400",
        "--config",
        missingConfigPath,
        "--out",
        join(outRoot, "runs"),
      ],
      deps({ llm: new FakeLlm([draft]) }),
    );

    expect(code).not.toBe(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
    // This is the guaranteed first-run experience -- podcast.config.json is
    // gitignored, so every new operator hits ENOENT here first. A bare ENOENT
    // with no mention of the template or the example file is a dead end.
    const output = lines.join("\n");
    expect(output).toContain(CONFIG_TEMPLATE);
    expect(output).toContain("podcast.config.example.json");
  });

  it("refuses malformed JSON in the config file", async () => {
    const malformedPath = join(outRoot, "malformed.json");
    await writeFile(malformedPath, "{ not json");

    const code = await runCli(
      [
        "plan",
        "module:06-mcp",
        "--duration",
        "2400",
        "--config",
        malformedPath,
        "--out",
        join(outRoot, "runs"),
      ],
      deps({ llm: new FakeLlm([draft]) }),
    );

    expect(code).not.toBe(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
    expect(lines.join("\n")).toContain(CONFIG_TEMPLATE);
  });

  it("refuses valid JSON that fails schema validation", async () => {
    const invalidPath = join(outRoot, "invalid.json");
    await writeFile(invalidPath, JSON.stringify({ llm: {} }));

    const code = await runCli(
      [
        "plan",
        "module:06-mcp",
        "--duration",
        "2400",
        "--config",
        invalidPath,
        "--out",
        join(outRoot, "runs"),
      ],
      deps({ llm: new FakeLlm([draft]) }),
    );

    expect(code).not.toBe(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
    expect(lines.join("\n")).toContain(CONFIG_TEMPLATE);
  });
});

describe("runCli — create", () => {
  const script = {
    turns: [
      { speaker: "host", text: "What does MCP actually standardise?" },
      { speaker: "guest", text: "The transport, and deliberately not the capability." },
    ],
  };

  /** `create` costs two model calls, in this order. */
  async function creating(ids: string[]) {
    return new FakeLlm([
      { ...draft, beats: [{ ...draft.beats[0]!, excerptIds: [ids[0]!] }] },
      script,
    ]);
  }

  async function realIds(): Promise<string[]> {
    const documents = await loadAllDocuments(REPO_ROOT);
    return deriveExcerptIds(buildSourcePack(documents, "module:06-mcp").excerpts);
  }

  const create = (extra: string[] = []) => ["create", ...base(extra).slice(1)];

  it("estimates both model calls and writes nothing without --run", async () => {
    const llm = new FakeLlm([draft, script]);

    const code = await runCli(create(), deps({ llm, tts: new FakeWavTts() }));

    expect(code).toBe(0);
    expect(llm.calls).toHaveLength(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();

    const output = lines.join("\n");
    expect(output).toMatch(/dialogue input/);
    expect(output).toMatch(/dialogue output/);
    // The quality passes are what `create` still does not do. Saying so is the
    // same discipline that made `create` refuse when it did nothing at all.
    expect(output).toMatch(/review, revision/);
  });

  it("estimates more than plan alone, because it makes a second call", async () => {
    await runCli(base(), deps({ llm: new FakeLlm([draft]) }));
    const planOnly = Number(/estimated at max output\s+\$([\d.]+)/.exec(lines.join("\n"))?.[1]);

    lines = [];
    await runCli(create(), deps({ llm: new FakeLlm([draft]), tts: new FakeWavTts() }));
    const both = Number(/estimated at max output\s+\$([\d.]+)/.exec(lines.join("\n"))?.[1]);

    expect(both).toBeGreaterThan(planOnly);
  });

  it("writes a playable episode, its script, its plan, and a complete manifest", async () => {
    const llm = await creating(await realIds());
    const tts = new FakeWavTts();

    const code = await runCli(create(["--run"]), deps({ llm, tts }));

    expect(code).toBe(0);
    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    expect((await readdir(dir)).sort()).toEqual([
      "episode.wav",
      "manifest.json",
      "plan.json",
      "script.json",
    ]);

    // Playable means a real container of the expected length, not a file that
    // exists: 86 characters of speech at 16 chars/s is 5.375 seconds.
    const audio = await readFile(join(dir, "episode.wav"));
    expect(wavDurationSeconds(new Uint8Array(audio))).toBeCloseTo(86 / 16, 2);
  });

  it("casts the two speakers to the two configured voices", async () => {
    const tts = new FakeWavTts();

    await runCli(create(["--run"]), deps({ llm: await creating(await realIds()), tts }));

    expect(tts.requests.map((request) => request.voice)).toEqual(["af_heart", "am_michael"]);
  });

  it("records both calls' tokens and the speech characters in one manifest", async () => {
    await runCli(
      create(["--run"]),
      deps({ llm: await creating(await realIds()), tts: new FakeWavTts() }),
    );

    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));

    expect(manifest.command).toBe("create");
    expect(manifest.status).toBe("complete");
    expect(manifest.usage.speechCharacters).toBe(86);
    expect(manifest.artifacts).toEqual([
      "plan.json",
      "script.json",
      "episode.wav",
      "manifest.json",
    ]);
    // Two calls, so more than the single-call plan run spends.
    expect(manifest.usage.outputTokens).toBeGreaterThan(0);
    expect(manifest.cost.measured).toBeGreaterThan(0);
  });

  it("keeps the plan and script when synthesis fails, and bills what was spent", async () => {
    // The expensive half of a create run is synthesis. Losing the two model
    // calls' output because the voice died would make the failure cost double
    // to retry.
    const broken: TtsPort = {
      name: "broken-tts",
      synthesise: () => Promise.reject(new Error("runner exited 1")),
    };

    const code = await runCli(
      create(["--run"]),
      deps({ llm: await creating(await realIds()), tts: broken }),
    );

    expect(code).toBe(1);
    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    expect((await readdir(dir)).sort()).toEqual(["manifest.json", "plan.json", "script.json"]);

    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.status).toBe("failed");
    expect(manifest.failure.stage).toBe("synthesis");
    expect(manifest.usage.outputTokens).toBeGreaterThan(0);
    expect(manifest.cost.measured).toBeGreaterThan(0);
    expect(lines.join("\n")).toMatch(/failed in synthesis/);
  });

  it("names the dialogue stage when the script is the thing that fails", async () => {
    const ids = await realIds();
    const llm = new FakeLlm([
      { ...draft, beats: [{ ...draft.beats[0]!, excerptIds: [ids[0]!] }] },
      // Two turns, one speaker: a monologue that satisfies the schema.
      {
        turns: [
          { speaker: "host", text: "One." },
          { speaker: "host", text: "Two." },
        ],
      },
    ]);

    const code = await runCli(create(["--run"]), deps({ llm, tts: new FakeWavTts() }));

    expect(code).toBe(1);
    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.failure.stage).toBe("dialogue");
    expect(manifest.usage.outputTokens).toBeGreaterThan(0);
  });
});

describe("runCli — plan --run", () => {
  async function realIds(): Promise<string[]> {
    const documents = await loadAllDocuments(REPO_ROOT);
    return deriveExcerptIds(buildSourcePack(documents, "module:06-mcp").excerpts);
  }

  it("writes plan.json and a complete manifest", async () => {
    const ids = await realIds();
    const llm = new FakeLlm([{ ...draft, beats: [{ ...draft.beats[0]!, excerptIds: [ids[0]!] }] }]);

    const code = await runCli(base(["--run"]), deps({ llm }));

    expect(code).toBe(0);
    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    expect((await readdir(dir)).sort()).toEqual(["manifest.json", "plan.json"]);
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.status).toBe("complete");
    expect(manifest.cost.estimatedAtMaxOutput).toBeGreaterThan(0);
  });

  it("reprints the estimate with measured usage beside it", async () => {
    // The estimate section exists to stop `estimatedAtMaxOutput` being read as
    // a promise; the reprint is how far off that estimate was becomes
    // observable rather than assumed.
    const ids = await realIds();
    const llm = new FakeLlm([{ ...draft, beats: [{ ...draft.beats[0]!, excerptIds: [ids[0]!] }] }]);

    const code = await runCli(base(["--run"]), deps({ llm }));

    expect(code).toBe(0);
    const output = lines.join("\n");
    expect(output).toMatch(/estimated at max output/i);
    expect(output).toMatch(/measured/i);
  });

  it("refuses a second run with the same id rather than overwriting", async () => {
    const ids = await realIds();
    const draftWithIds = { ...draft, beats: [{ ...draft.beats[0]!, excerptIds: [ids[0]!] }] };
    await runCli(base(["--run"]), deps({ llm: new FakeLlm([draftWithIds]) }));

    const llm = new FakeLlm([draftWithIds]);
    const code = await runCli(base(["--run"]), deps({ llm }));

    expect(code).not.toBe(0);
    expect(llm.calls).toHaveLength(0); // refused before the model call
  });

  it("preserves diagnostics when the model returns unusable output", async () => {
    const failing = {
      name: "failing",
      generate: () =>
        Promise.reject(
          new ModelResponseError("the model did not return a value matching the schema", {
            rawText: "Sure! Here is a plan:",
            finishReason: "stop",
          }),
        ),
    };

    const code = await runCli(base(["--run"]), deps({ llm: failing as never }));

    expect(code).not.toBe(0);
    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    const failure = JSON.parse(await readFile(join(dir, "failure.json"), "utf8"));
    expect(failure.rawText).toBe("Sure! Here is a plan:");
    expect(failure.finishReason).toBe("stop");
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.status).toBe("failed");
    expect(manifest.failure.stage).toBe("plan");
    // The model was identified before the call failed -- the manifest is the
    // file a tool reads to attribute cost, and losing `model` here means a
    // failed run cannot be attributed to anything.
    expect(manifest.model.modelId).toBe("claude-test");
  });

  it("carries measured usage into the failed manifest when the error has it", async () => {
    // A failed call can still have burned real tokens. `failure.json` already
    // records them; the manifest must not report `measured: null` while they
    // sit in a sibling file no schema describes.
    const failing = {
      name: "failing",
      generate: () =>
        Promise.reject(
          new ModelResponseError("the model did not return a value matching the schema", {
            rawText: "Sure! Here is a plan:",
            finishReason: "stop",
            usage: { inputTokens: 500, outputTokens: 12, speechCharacters: 0 },
          }),
        ),
    };

    const code = await runCli(base(["--run"]), deps({ llm: failing as never }));

    expect(code).not.toBe(0);
    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.status).toBe("failed");
    expect(manifest.usage).toEqual({ inputTokens: 500, outputTokens: 12, speechCharacters: 0 });
    expect(manifest.cost.measured).toBeGreaterThan(0);
  });
});

// `createLlm`'s provider factories (createAnthropic/createOpenAI) are lazy:
// they validate nothing synchronously and only touch the network once
// `generate` is actually called, so there is no apiKey/modelId combination
// that makes construction itself throw, deterministically, offline. That
// means the catch around construction added for this ordering fix has no
// input that exercises its error branch without a real network call -- which
// is exactly the case this suite must not do.
//
// What *is* testable offline: that omitting `deps.llm` (forcing the real,
// uninjected `createLlm` call) does not crash or block the pre-reservation
// path, and that construction happening before reservation means a
// reservation failure -- forced here by pre-seeding the exact directory the
// CLI is about to reserve -- is reached and reported without ever calling
// `generate` (proven by the run never getting far enough to touch the
// network: the test would hang or throw an unhandled network error if it
// had).
describe("runCli — llm construction (uninjected)", () => {
  it("reaches reservation through the real createLlm call without a network call", async () => {
    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    // Pre-seed the collision so reservation -- which now happens after the
    // real llm is constructed -- fails deterministically, before
    // `planEpisode` would ever call `llm.generate`.
    await reserveRunDirectory(
      join(outRoot, "runs"),
      "module-06-mcp",
      "2026-08-16T13-42-07Z-a3f9c1",
    );

    // No `llm` override: runCli must go through `deps.llm ?? createLlm(...)`.
    const code = await runCli(base(["--run"]), deps());

    expect(code).not.toBe(0);
    // Nothing was added to the pre-seeded (empty) directory: no plan.json,
    // no manifest.json, no failure.json -- the run never got past reservation.
    expect(await readdir(dir)).toEqual([]);
  });
});
