import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";

function valid(): Record<string, unknown> {
  return {
    llm: { provider: "anthropic", modelId: "claude-x", maxOutputTokens: 4000 },
    prices: {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
      speechPerMillionCharacters: 0,
    },
    tts: {
      provider: "local",
      modelId: "mlx-community/Kokoro-82M-bf16",
      voices: { host: "af_heart", guest: "am_michael" },
      language: "en-US",
      measuredOn: "Apple M4, 24 GB",
      charsPerSecond: 14.77,
      synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0.073 },
      runner: {
        name: "kokoro-82m",
        cwd: "packages/podcast-providers",
        command: ".venv/bin/python",
        args: ["-u", "runners/kokoro_mlx.py", "--text", "{text}", "--out", "{out}"],
        mediaType: "audio/wav",
        timeoutSeconds: 600,
      },
    },
    plan: { expansionFactor: 3, maxRenderSeconds: 300 },
  };
}

/** Replace one nested field, leaving the rest of a valid config intact. */
function withField(path: string[], value: unknown): Record<string, unknown> {
  const config = valid();
  let cursor = config as Record<string, unknown>;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  cursor[path[path.length - 1]!] = value;
  return config;
}

describe("parseConfig", () => {
  it("accepts a well-formed config", () => {
    expect(() => parseConfig(valid())).not.toThrow();
  });

  it("rejects an unrecognised key", () => {
    // This is what strict mode buys, and the assertion that proves it is on.
    const config = valid();
    (config["llm"] as Record<string, unknown>)["modelID"] = "typo";

    expect(() => parseConfig(config)).toThrow();
  });

  it("rejects a missing block", () => {
    const config = valid();
    delete config["prices"];

    expect(() => parseConfig(config)).toThrow();
  });

  it.each([
    ["llm.maxOutputTokens zero", ["llm", "maxOutputTokens"], 0],
    ["llm.maxOutputTokens fractional", ["llm", "maxOutputTokens"], 1.5],
    ["negative price", ["prices", "inputPerMillionTokens"], -1],
    ["charsPerSecond zero", ["tts", "charsPerSecond"], 0],
    ["fixedSeconds zero", ["tts", "synthesisCost", "fixedSeconds"], 0],
    ["negative marginalRtf", ["tts", "synthesisCost", "marginalRtf"], -0.1],
    ["timeoutSeconds zero", ["tts", "runner", "timeoutSeconds"], 0],
    ["expansionFactor zero", ["plan", "expansionFactor"], 0],
    ["maxRenderSeconds zero", ["plan", "maxRenderSeconds"], 0],
    ["blank modelId", ["llm", "modelId"], "   "],
  ] as Array<[string, string[], unknown]>)("rejects %s", (_label, path, value) => {
    expect(() => parseConfig(withField(path, value))).toThrow();
  });

  it("accepts a zero marginalRtf and a zero speech price", () => {
    // Both are meaningful zeros: synthesis with no per-second cost, and local
    // synthesis that costs nothing per character. Rejecting them would forbid
    // the only configuration this CLI currently supports.
    expect(() => parseConfig(withField(["tts", "synthesisCost", "marginalRtf"], 0))).not.toThrow();
    expect(() => parseConfig(withField(["prices", "speechPerMillionCharacters"], 0))).not.toThrow();
  });

  it("rejects a speech provider it cannot construct", () => {
    // "banana" passes trimmed-non-empty and would fail much later, at
    // synthesis, with an error about something else.
    expect(() => parseConfig(withField(["tts", "provider"], "banana"))).toThrow();
    expect(() => parseConfig(withField(["tts", "provider"], "elevenlabs"))).toThrow();
  });

  it("rejects a language the local profile does not cover", () => {
    // ta-IN is a real language tag, and local coverage is deliberately
    // ["en-US", "en-GB"] because most small local models are English-only.
    // Failing here beats producing confident audio in the wrong language.
    expect(() => parseConfig(withField(["tts", "language"], "elvish"))).toThrow();
    expect(() => parseConfig(withField(["tts", "language"], "ta-IN"))).toThrow();
    expect(() => parseConfig(withField(["tts", "language"], "en-GB"))).not.toThrow();
  });

  it("rejects casting that would make both speakers sound the same", () => {
    // A single `voice`, or a host with no guest, is the shape that yields an
    // episode where the dialogue is two people and the audio is one.
    expect(() => parseConfig(withField(["tts", "voices"], { host: "af_heart" }))).toThrow();
    expect(() => parseConfig(withField(["tts", "voices"], "af_heart"))).toThrow();
    expect(() =>
      parseConfig(withField(["tts", "voices"], { host: "af_heart", guest: "  " })),
    ).toThrow();
  });

  it("does not touch the filesystem", () => {
    // The runner command need not exist to plan an episode. An eager check
    // here would kill `plan` on any machine without the synthesis venv.
    const config = withField(["tts", "runner", "command"], "/nonexistent/python");

    expect(() => parseConfig(config)).not.toThrow();
  });
});
