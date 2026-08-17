import { describe, expect, it } from "vitest";
import { concatenateWav, readWavChunks } from "./wav.ts";
import { wavDurationSeconds } from "./local.ts";

interface WavOptions {
  data: Buffer;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  /** Extra chunk written between `fmt ` and `data`, as real writers do. */
  extra?: { id: string; body: Buffer };
}

function wav({
  data,
  sampleRate = 24_000,
  channels = 1,
  bitsPerSample = 16,
  extra,
}: WavOptions): Uint8Array {
  const blockAlign = (channels * bitsPerSample) / 8;
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * blockAlign, 8);
  fmt.writeUInt16LE(blockAlign, 12);
  fmt.writeUInt16LE(bitsPerSample, 14);

  const pieces: Buffer[] = [];
  const push = (id: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, "ascii");
    head.writeUInt32LE(body.length, 4);
    pieces.push(head, body);
    if (body.length % 2 === 1) pieces.push(Buffer.alloc(1));
  };

  push("fmt ", fmt);
  if (extra) push(extra.id, extra.body);
  push("data", data);

  const rest = Buffer.concat(pieces);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + rest.length, 4);
  header.write("WAVE", 8, "ascii");
  return new Uint8Array(Buffer.concat([header, rest]));
}

describe("readWavChunks", () => {
  it("finds data past an interleaved chunk rather than at a fixed offset", () => {
    const chunks = readWavChunks(
      wav({ data: Buffer.alloc(8, 7), extra: { id: "LIST", body: Buffer.alloc(10, 3) } }),
    );

    expect(chunks?.map((chunk) => chunk.id)).toEqual(["fmt ", "LIST", "data"]);
    expect(chunks?.find((chunk) => chunk.id === "data")?.body).toEqual(Buffer.alloc(8, 7));
  });

  it("skips the pad byte after an odd-sized chunk", () => {
    const chunks = readWavChunks(
      wav({ data: Buffer.alloc(4, 9), extra: { id: "LIST", body: Buffer.alloc(5, 1) } }),
    );

    expect(chunks?.map((chunk) => chunk.id)).toEqual(["fmt ", "LIST", "data"]);
  });

  it("returns null for bytes that are not RIFF/WAVE", () => {
    expect(readWavChunks(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBeNull();
    expect(readWavChunks(new Uint8Array(8))).toBeNull();
  });
});

describe("concatenateWav", () => {
  it("produces one wav whose duration is the sum of its parts", () => {
    const parts = [
      wav({ data: Buffer.alloc(48_000, 1) }),
      wav({ data: Buffer.alloc(24_000, 2) }),
      wav({ data: Buffer.alloc(96_000, 3) }),
    ];

    const joined = concatenateWav(parts);
    const total = parts.reduce((sum, part) => sum + (wavDurationSeconds(part) ?? 0), 0);

    expect(wavDurationSeconds(joined)).toBeCloseTo(total, 6);
    expect(wavDurationSeconds(joined)).toBeCloseTo(3.5, 6);
  });

  it("keeps the samples in order and loses none of them", () => {
    const joined = concatenateWav([
      wav({ data: Buffer.from([1, 1, 2, 2]) }),
      wav({ data: Buffer.from([3, 3, 4, 4]) }),
    ]);

    const data = readWavChunks(joined)?.find((chunk) => chunk.id === "data")?.body;
    expect(data).toEqual(Buffer.from([1, 1, 2, 2, 3, 3, 4, 4]));
  });

  it("declares a RIFF size that matches the bytes it actually wrote", () => {
    const joined = concatenateWav([wav({ data: Buffer.alloc(1000, 5) })]);
    const view = Buffer.from(joined);

    expect(view.readUInt32LE(4)).toBe(joined.byteLength - 8);
  });

  it("refuses to join a different sample rate rather than producing wrong pitch", () => {
    expect(() =>
      concatenateWav([
        wav({ data: Buffer.alloc(100), sampleRate: 24_000 }),
        wav({ data: Buffer.alloc(100), sampleRate: 44_100 }),
      ]),
    ).toThrow(/different audio format/);
  });

  it("refuses to join a different channel count", () => {
    expect(() =>
      concatenateWav([
        wav({ data: Buffer.alloc(100), channels: 1 }),
        wav({ data: Buffer.alloc(100), channels: 2 }),
      ]),
    ).toThrow(/different audio format/);
  });

  it("names the part that is not a wav at all", () => {
    expect(() =>
      concatenateWav([wav({ data: Buffer.alloc(100) }), new Uint8Array([0xff, 0xfb])]),
    ).toThrow(/part 1 is not a RIFF\/WAVE file/);
  });

  it("refuses an empty list rather than writing a zero-length episode", () => {
    expect(() => concatenateWav([])).toThrow(/at least one part/);
  });
});
