import { describe, expect, it } from "vitest";
import { wavDurationSeconds } from "@handbook/podcast-providers";
import type { SpeechRequest, TtsPort, TtsResult } from "@handbook/podcast-providers";
import { renderEpisode } from "./episode.ts";
import type { DialogueScript } from "./dialogue.ts";

const SAMPLE_RATE = 24_000;
const BYTES_PER_SAMPLE = 2;

/** A real 16-bit mono WAV, so assembly is exercised rather than simulated. */
function wav(seconds: number, sampleRate = SAMPLE_RATE): Uint8Array {
  const data = Buffer.alloc(Math.round(seconds * sampleRate) * BYTES_PER_SAMPLE, 1);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([header, data]));
}

interface WavTtsOptions {
  mediaTypes?: string[];
  sampleRates?: number[];
}

/** Renders one second of audio per 16 characters, and records every request. */
class WavTts implements TtsPort {
  readonly name = "wav-tts";
  readonly requests: SpeechRequest[] = [];
  private call = 0;
  private readonly options: WavTtsOptions;

  constructor(options: WavTtsOptions = {}) {
    this.options = options;
  }

  async synthesise(request: SpeechRequest): Promise<TtsResult> {
    const index = this.call++;
    this.requests.push(request);

    return {
      audio: wav(request.text.length / 16, this.options.sampleRates?.[index] ?? SAMPLE_RATE),
      mediaType: this.options.mediaTypes?.[index] ?? "audio/wav",
      modelId: "wav-tts",
      appliedSpeed: null,
      elapsedSeconds: 0.5,
      usage: { inputTokens: 0, outputTokens: 0, speechCharacters: request.text.length },
    };
  }
}

const script: DialogueScript = {
  turns: [
    { speaker: "host", beat: 1, text: "a".repeat(160) },
    { speaker: "guest", beat: 1, text: "b".repeat(320) },
  ],
};

const cast = { voices: { host: "af_heart", guest: "am_michael" }, language: "en-US" } as const;

describe("renderEpisode", () => {
  it("speaks the script's own words, not the transcript's escaped ones", async () => {
    // The transcript escapes Markdown delimiters so a spoken `__del__` does not
    // render as bold. Synthesis must never see those backslashes: it reads
    // `script.json`, and a voice would pronounce them. This is the guard on
    // that separation -- routing synthesis through the transcript, or escaping
    // at the script level, fails here rather than in an audible episode.
    const tts = new WavTts();
    const spoken = "__del__ runs at exit, and `_meta` carries the version";

    await renderEpisode({ turns: [{ speaker: "host", beat: 1, text: spoken }] }, tts, cast);

    expect(tts.requests[0]?.text).toBe(spoken);
    expect(tts.requests[0]?.text).not.toContain("\\");
  });

  it("casts each speaker to its own voice", async () => {
    const tts = new WavTts();

    await renderEpisode(script, tts, cast);

    expect(tts.requests.map((request) => request.voice)).toEqual(["af_heart", "am_michael"]);
    expect(tts.requests.every((request) => request.language === "en-US")).toBe(true);
  });

  it("returns one file whose duration is the sum of the turns", async () => {
    const episode = await renderEpisode(script, new WavTts(), cast);

    // 160 chars -> 10s, 320 chars -> 20s.
    expect(episode.audioSeconds).toBeCloseTo(30, 3);
    expect(wavDurationSeconds(episode.audio)).toBeCloseTo(30, 3);
    expect(episode.turns.map((turn) => turn.audioSeconds)).toEqual([10, 20]);
  });

  it("accumulates speech characters and provider wall clock", async () => {
    const episode = await renderEpisode(script, new WavTts(), cast);

    expect(episode.usage.speechCharacters).toBe(480);
    expect(episode.elapsedSeconds).toBeCloseTo(1, 6);
  });

  it("reports progress per turn, so a long render is not a silent wait", async () => {
    const seen: Array<[number, number, string]> = [];

    await renderEpisode(script, new WavTts(), {
      ...cast,
      onTurn: (index, total, speaker) => seen.push([index, total, speaker]),
    });

    expect(seen).toEqual([
      [0, 2, "host"],
      [1, 2, "guest"],
    ]);
  });

  it("names the provider when the format changes mid-episode", async () => {
    const tts = new WavTts({ mediaTypes: ["audio/wav", "audio/mpeg"] });

    await expect(renderEpisode(script, tts, cast)).rejects.toThrow(/changed format mid-episode/);
  });

  it("refuses to assemble a format it cannot join", async () => {
    const tts = new WavTts({ mediaTypes: ["audio/mpeg", "audio/mpeg"] });

    await expect(renderEpisode(script, tts, cast)).rejects.toThrow(/can only join wav/);
  });

  it("refuses turns that would play back at the wrong pitch", async () => {
    // Same media type, different sample rate: the case a mediaType check alone
    // lets through, and the one that yields a chipmunk second half.
    const tts = new WavTts({ sampleRates: [SAMPLE_RATE, 44_100] });

    await expect(renderEpisode(script, tts, cast)).rejects.toThrow(/different audio format/);
  });
});
