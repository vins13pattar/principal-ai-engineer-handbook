import { beforeAll, describe, expect, it, vi } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALL_LANGUAGES,
  DEFAULT_LANGUAGE,
  INDIAN_LANGUAGES,
  assertSpeakable,
  isIndianLanguage,
  providersFor,
} from "./language.ts";
import { chunkForSarvam, createSarvamTts } from "./sarvam.ts";
import { createLocalTts, estimateSpokenSeconds, realTimeFactor } from "./local.ts";

describe("language coverage", () => {
  it("treats Indian English as its own target, not a fallback", () => {
    expect(isIndianLanguage("en-IN")).toBe(true);
    expect(isIndianLanguage("en-US")).toBe(false);
    expect(ALL_LANGUAGES).toContain("en-IN");
    expect(ALL_LANGUAGES).toContain("en-US");
  });

  it("ships English first", () => {
    expect(DEFAULT_LANGUAGE).toBe("en-US");
    expect(providersFor("en-US").length).toBeGreaterThan(1);
  });

  it("names Sarvam for languages no international provider covers", () => {
    // Odia is the case that matters: if this ever returns [] the pipeline
    // would otherwise pick a provider that returns confident English audio.
    expect(providersFor("od-IN")).toEqual(["sarvam"]);
    expect(providersFor("ml-IN")).toEqual(["sarvam"]);
  });

  it("refuses a language no configured provider speaks", () => {
    expect(() => assertSpeakable("ta-IN", ["openai"])).toThrow(/no configured provider speaks/);
    // And says who could, so the message is actionable.
    expect(() => assertSpeakable("ta-IN", ["openai"])).toThrow(/sarvam|elevenlabs/);
  });

  it("passes when a capable provider is configured", () => {
    expect(() => assertSpeakable("ta-IN", ["openai", "sarvam"])).not.toThrow();
  });

  it("covers every Indian language the Sarvam SDK declares", () => {
    expect(INDIAN_LANGUAGES.length).toBeGreaterThanOrEqual(17);
  });
});

describe("chunkForSarvam", () => {
  it("leaves short text alone", () => {
    expect(chunkForSarvam("short")).toEqual(["short"]);
  });

  it("splits on sentence boundaries rather than a hard offset", () => {
    const text = `${"a".repeat(800)}. ${"b".repeat(800)}.`;

    const chunks = chunkForSarvam(text, 1000);

    expect(chunks).toHaveLength(2);
    // A cut mid-sentence produces an audible seam; each chunk ends a sentence.
    expect(chunks[0]!.endsWith(".")).toBe(true);
  });

  it("recognises the Devanagari danda as a sentence end", () => {
    const text = `${"क".repeat(60)}। ${"ख".repeat(60)}।`;

    expect(chunkForSarvam(text, 80).length).toBeGreaterThan(1);
  });

  it("hard-breaks a single sentence longer than the limit rather than dropping it", () => {
    const chunks = chunkForSarvam("x".repeat(2500), 1000);

    expect(chunks.join("")).toHaveLength(2500);
  });
});

describe("createSarvamTts", () => {
  const okResponse = (): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify({ audios: [Buffer.from("audio").toString("base64")] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

  it("refuses a non-Indian language instead of returning wrong audio", async () => {
    const tts = createSarvamTts({ apiKey: "k", fetchImpl: vi.fn() as never });

    await expect(
      tts.synthesise({ text: "hello", voice: "anushka", language: "en-US" }),
    ).rejects.toThrow(/Indian languages/);
  });

  it("sends the language as Sarvam's target_language_code", async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = (_url: string, init?: RequestInit): Promise<Response> => {
      if (init) seen.push(init);
      return okResponse();
    };
    const tts = createSarvamTts({ apiKey: "k", fetchImpl: fetchImpl as never });

    await tts.synthesise({ text: "नमस्ते", voice: "anushka", language: "hi-IN" });

    const body = JSON.parse(seen[0]!.body as string);
    expect(body.target_language_code).toBe("hi-IN");
    expect(body.model).toBe("bulbul:v3");
  });

  it("reports WAV, because assembly must not assume MP3", async () => {
    const tts = createSarvamTts({ apiKey: "k", fetchImpl: vi.fn(okResponse) as never });

    const result = await tts.synthesise({ text: "नमस्ते", voice: "v", language: "hi-IN" });

    expect(result.mediaType).toBe("audio/wav");
  });

  it("throws on a 200 with no audio rather than appending zero bytes", async () => {
    // The dangerous case: silently produces a short episode with no error.
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
    );
    const tts = createSarvamTts({ apiKey: "k", fetchImpl: fetchImpl as never });

    await expect(tts.synthesise({ text: "नमस्ते", voice: "v", language: "hi-IN" })).rejects.toThrow(
      /no audio payload/,
    );
  });

  it("concatenates chunks so long text yields one audio buffer", async () => {
    const fetchImpl = vi.fn(okResponse);
    const tts = createSarvamTts({ apiKey: "k", fetchImpl: fetchImpl as never });

    const result = await tts.synthesise({
      text: `${"क".repeat(1400)}। ${"ख".repeat(1400)}।`,
      voice: "v",
      language: "hi-IN",
    });

    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    expect(result.audio.length).toBe(5 * fetchImpl.mock.calls.length);
  });
});

describe("realTimeFactor", () => {
  it("is below 1 when synthesis outruns playback", () => {
    expect(realTimeFactor(10, 60)).toBeCloseTo(0.167, 3);
    expect(realTimeFactor(120, 60)).toBe(2);
  });

  it("reports Infinity rather than dividing by zero", () => {
    expect(realTimeFactor(5, 0)).toBe(Infinity);
  });

  it("projects a 40-minute episode from a measured factor", () => {
    // The number that decides whether local synthesis is viable at all.
    expect(40 * realTimeFactor(10, 60)).toBeCloseTo(6.67, 1);
  });
});

describe("estimateSpokenSeconds", () => {
  it("puts a 40-minute episode near the design's character estimate", () => {
    // The design assumes ~38,000 characters for 40 minutes; at 14 chars/sec
    // that is ~45 minutes, so the estimate is the right order.
    expect(estimateSpokenSeconds(38_000) / 60).toBeGreaterThan(35);
    expect(estimateSpokenSeconds(38_000) / 60).toBeLessThan(50);
  });
});

describe("createLocalTts against a real subprocess", () => {
  // Not a mock. The subprocess boundary is where this adapter can actually be
  // wrong -- argv substitution, file handoff, exit-code handling -- and none
  // of that is exercised by a fake.
  const RUNNER = join(tmpdir(), "handbook-fake-tts.py");

  beforeAll(async () => {
    await writeFile(
      RUNNER,
      [
        "import sys, struct, math, wave",
        "text, out = sys.argv[1], sys.argv[2]",
        "secs = max(0.1, len(text) / 14.0)",
        "w = wave.open(out, 'w')",
        "w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)",
        "w.writeframes(b''.join(struct.pack('<h', int(3000*math.sin(i/20)))",
        "                       for i in range(int(8000*secs))))",
        "w.close()",
      ].join("\n"),
    );
  });

  it("drives the command and returns the bytes it wrote", async () => {
    const tts = createLocalTts({
      name: "probe",
      command: "python3",
      args: [RUNNER, "{text}", "{out}"],
    });

    const result = await tts.synthesise({ text: "hello there", voice: "d", language: "en-US" });

    expect(Buffer.from(result.audio.slice(0, 4)).toString()).toBe("RIFF");
    expect(result.elapsedSeconds).toBeGreaterThan(0);
  });

  it("charges nothing, while still counting characters for comparison", async () => {
    const tts = createLocalTts({
      name: "probe",
      command: "python3",
      args: [RUNNER, "{text}", "{out}"],
    });

    const result = await tts.synthesise({ text: "twelve chars", voice: "d", language: "en-US" });

    expect(result.usage.inputTokens + result.usage.outputTokens).toBe(0);
    expect(result.usage.speechCharacters).toBe(12);
  });

  it("names the problem when a runner exits 0 without writing anything", async () => {
    // Found by running it: this used to surface as an ENOENT with a temp path,
    // which says nothing about what the operator got wrong.
    const tts = createLocalTts({ name: "silent", command: "true", args: [] });

    await expect(tts.synthesise({ text: "x", voice: "d", language: "en-US" })).rejects.toThrow(
      /exited 0 but wrote no output file/,
    );
  });

  it("reports a missing binary as a start failure", async () => {
    const tts = createLocalTts({ name: "absent", command: "no-such-binary-xyz", args: [] });

    await expect(tts.synthesise({ text: "x", voice: "d", language: "en-US" })).rejects.toThrow(
      /could not start/,
    );
  });

  it("never routes text through a shell", async () => {
    // Episode text is model output. If it reached a shell, this would create
    // the file named in the injection.
    const marker = join(tmpdir(), `handbook-injection-${Date.now()}`);
    const tts = createLocalTts({
      name: "probe",
      command: "python3",
      args: [RUNNER, "{text}", "{out}"],
    });

    await tts.synthesise({
      text: `hello; touch ${marker}`,
      voice: "d",
      language: "en-US",
    });

    await expect(access(marker)).rejects.toThrow();
  });
});
