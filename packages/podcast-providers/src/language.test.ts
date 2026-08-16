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
import {
  createLocalTts,
  estimateSpokenSeconds,
  fitSynthesisCost,
  projectRenderSeconds,
  realTimeFactor,
  wavDurationSeconds,
} from "./local.ts";

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

  it("is not a constant across call sizes, so it cannot be scaled to an episode", () => {
    // Both rows are the same model on the same machine (measured, see
    // fitSynthesisCost below). The factor nearly halves as the call grows,
    // because a fixed per-call cost is being amortised over more audio.
    expect(realTimeFactor(6.4, 45.15)).toBeCloseTo(0.142, 3);
    expect(realTimeFactor(22.76, 262.975)).toBeCloseTo(0.087, 3);

    // So multiplying either one by an episode length answers a different
    // question than the one asked, which is what projectRenderSeconds fixes.
    expect(40 * 60 * realTimeFactor(6.4, 45.15)).toBeCloseTo(340, 0);
    expect(40 * 60 * realTimeFactor(22.76, 262.975)).toBeCloseTo(208, 0);
  });
});

describe("estimateSpokenSeconds", () => {
  it("puts a 40-minute episode near the design's character estimate", () => {
    // The design assumes ~38,000 characters for 40 minutes; at 14 chars/sec
    // that is ~45 minutes, so the estimate is the right order.
    expect(estimateSpokenSeconds(38_000) / 60).toBeGreaterThan(35);
    expect(estimateSpokenSeconds(38_000) / 60).toBeLessThan(50);
  });

  it("runs long against a measured voice, which is why the bench does not use it", () => {
    // Kokoro af_heart spoke 731 characters in 45.15s -> 16.2 chars/sec, not 14.
    // Estimating instead of measuring reports every RTF ~15% better than it is.
    expect(estimateSpokenSeconds(731)).toBeCloseTo(52.2, 1);
    expect(estimateSpokenSeconds(731) / 45.15).toBeGreaterThan(1.15);
  });
});

describe("wavDurationSeconds", () => {
  /** A WAV header with no samples, so the byte length is the header itself. */
  function wav({ sampleRate = 24_000, channels = 1, bits = 16, dataBytes = 0 } = {}): Uint8Array {
    const byteRate = (sampleRate * channels * bits) / 8;
    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE((channels * bits) / 8, 32);
    buffer.writeUInt16LE(bits, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataBytes, 40);
    return new Uint8Array(buffer);
  }

  it("reads the duration Kokoro actually produced", () => {
    // 45.15s of 24 kHz mono 16-bit is 2,167,200 bytes of samples.
    expect(wavDurationSeconds(wav({ dataBytes: 2_167_200 }))).toBeCloseTo(45.15, 2);
  });

  it("returns null rather than a wrong number for audio it cannot parse", () => {
    // An MP3 from a hosted provider must fall back to the estimate visibly,
    // not be silently assigned a duration derived from a WAV assumption.
    expect(wavDurationSeconds(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBeNull();
    expect(wavDurationSeconds(new Uint8Array(8))).toBeNull();
  });

  it("walks past chunks it does not care about to find the data chunk", () => {
    // Real writers put LIST/INFO between fmt and data. Assuming data sits at
    // byte 36 works until it does not, and then reports a plausible duration.
    const base = Buffer.from(wav({ dataBytes: 48_000 }));
    const extra = Buffer.alloc(12);
    extra.write("LIST", 0);
    extra.writeUInt32LE(4, 4);
    extra.write("INFO", 8);
    const spliced = Buffer.concat([base.subarray(0, 36), extra, base.subarray(36)]);
    spliced.writeUInt32LE(spliced.length - 8, 4);

    expect(wavDurationSeconds(new Uint8Array(spliced))).toBeCloseTo(1, 3);
  });
});

describe("fitSynthesisCost", () => {
  // Measured on an M4 Air (24 GB), Kokoro-82M bf16 via mlx-audio, voice
  // af_heart. Four call sizes, real audio durations read from the WAVs.
  const MEASURED = [
    { audioSeconds: 45.15, elapsedSeconds: 6.4 },
    { audioSeconds: 88.9, elapsedSeconds: 9.65 },
    { audioSeconds: 176.525, elapsedSeconds: 15.92 },
    { audioSeconds: 262.975, elapsedSeconds: 22.76 },
  ];

  it("separates the per-call fixed cost from the per-second one", () => {
    const fit = fitSynthesisCost(MEASURED);

    // ~3s of model load on every call, then 13x faster than real time.
    expect(fit.fixedSeconds).toBeCloseTo(2.96, 1);
    expect(fit.marginalRtf).toBeCloseTo(0.075, 3);
  });

  it("refuses to fit a line through one point", () => {
    // One measurement cannot tell a fixed cost from a marginal one, and
    // guessing which it is produces the projection this replaced.
    expect(() => fitSynthesisCost(MEASURED.slice(0, 1))).toThrow(/at least two/);
    expect(() =>
      fitSynthesisCost([
        { audioSeconds: 45, elapsedSeconds: 6.4 },
        { audioSeconds: 45, elapsedSeconds: 6.5 },
      ]),
    ).toThrow(/different lengths/);
  });
});

describe("projectRenderSeconds", () => {
  const FIT = { fixedSeconds: 2.96, marginalRtf: 0.0748 };

  it("renders a 40-minute episode in three minutes as one call", () => {
    expect(projectRenderSeconds(FIT, 40 * 60, 1) / 60).toBeCloseTo(3.0, 1);
  });

  it("charges the fixed cost once per segment, not once per episode", () => {
    // This is the number the episode planner needs: at 120 segments, two
    // thirds of the render is model loading rather than synthesis.
    const seconds = projectRenderSeconds(FIT, 40 * 60, 120);
    expect(seconds / 60).toBeCloseTo(8.9, 1);
    expect((120 * FIT.fixedSeconds) / seconds).toBeGreaterThan(0.66);
  });

  it("grows with segment count while the audio stays the same length", () => {
    const audio = 40 * 60;
    expect(projectRenderSeconds(FIT, audio, 60)).toBeLessThan(
      projectRenderSeconds(FIT, audio, 120),
    );
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

  it("survives a runner that writes more to stdout than a pipe buffer holds", async () => {
    // mlx-audio prints per call and draws progress bars on a cache miss. An
    // unread stdout pipe holds 64 KiB and then blocks the writer forever, so
    // this hung until the timeout killed it -- with a message about a timeout
    // rather than about the real cause.
    const noisy = join(tmpdir(), "handbook-noisy-tts.py");
    await writeFile(
      noisy,
      [
        "import sys, wave, struct",
        "sys.stdout.write('x' * 300_000)", // comfortably past any pipe buffer
        "sys.stdout.flush()",
        "w = wave.open(sys.argv[2], 'w')",
        "w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)",
        "w.writeframes(struct.pack('<h', 0) * 8000)",
        "w.close()",
      ].join("\n"),
    );

    const tts = createLocalTts({
      name: "noisy",
      command: "python3",
      args: [noisy, "{text}", "{out}"],
      timeoutSeconds: 20,
    });

    const result = await tts.synthesise({ text: "hello", voice: "d", language: "en-US" });

    expect(Buffer.from(result.audio.slice(0, 4)).toString()).toBe("RIFF");
  });

  it("puts what the runner printed into the failure, not just its exit code", async () => {
    // A runner that fails says why on one stream or the other. Keeping only
    // stderr loses the reason for every runner that logs to stdout.
    const chatty = join(tmpdir(), "handbook-chatty-tts.py");
    await writeFile(
      chatty,
      ["import sys", "print('could not load the voice pack')", "sys.exit(3)"].join("\n"),
    );

    const tts = createLocalTts({ name: "chatty", command: "python3", args: [chatty] });

    await expect(tts.synthesise({ text: "x", voice: "d", language: "en-US" })).rejects.toThrow(
      /could not load the voice pack/,
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
