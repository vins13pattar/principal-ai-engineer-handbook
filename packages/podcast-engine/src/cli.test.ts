import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSourcePack, loadAllDocuments } from "@handbook/content";
import { FakeLlm } from "@handbook/podcast-providers";
import { ModelResponseError } from "@handbook/podcast-providers";
import { runCli } from "./cli.ts";
import { CONFIG_TEMPLATE } from "./config.ts";
import { deriveExcerptIds } from "./ids.ts";

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

describe("runCli — create", () => {
  it("refuses with and without --run, naming the missing stages", async () => {
    for (const argv of [
      ["create", ...base().slice(1)],
      ["create", ...base(["--run"]).slice(1)],
    ]) {
      lines = [];
      const llm = new FakeLlm([draft]);

      const code = await runCli(argv, deps({ llm }));

      expect(code).not.toBe(0);
      expect(llm.calls).toHaveLength(0);
      expect(lines.join("\n")).toMatch(/dialogue/);
      await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
    }
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
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.status).toBe("failed");
    expect(manifest.failure.stage).toBe("plan");
  });
});
