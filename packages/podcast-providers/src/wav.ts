/**
 * Reading and joining the WAV container.
 *
 * Assembly is the one stage where a silent success is worse than a failure. A
 * concatenation that ignores the format header still produces a file every
 * player will open -- at the wrong pitch, or as noise, or with every segment
 * after the first misread. Nothing downstream can detect that, and the operator
 * finds out by listening. So every check here throws rather than coping.
 */

export interface WavChunk {
  id: string;
  /** The chunk body, without the 8-byte id and size prefix. */
  body: Buffer;
}

/**
 * Walks the chunk list, or returns null when the bytes are not a RIFF/WAVE file.
 *
 * Walking rather than assuming `fmt ` at 12 and `data` at 36: writers interleave
 * LIST/INFO chunks, and an assumed offset yields a plausible wrong answer
 * instead of a parse failure.
 */
export function readWavChunks(audio: Uint8Array): WavChunk[] | null {
  const view = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
  if (view.length < 12) return null;
  if (view.toString("ascii", 0, 4) !== "RIFF") return null;
  if (view.toString("ascii", 8, 12) !== "WAVE") return null;

  const chunks: WavChunk[] = [];
  let offset = 12;

  while (offset + 8 <= view.length) {
    const id = view.toString("ascii", offset, offset + 4);
    const size = view.readUInt32LE(offset + 4);
    const body = offset + 8;

    // Trust the shorter of the declared size and what is actually present: a
    // truncated file declares the length it meant to write.
    const end = Math.min(body + size, view.length);
    chunks.push({ id, body: view.subarray(body, end) });

    // Chunks are word-aligned; an odd size is followed by a pad byte.
    offset = body + size + (size % 2);
  }

  return chunks;
}

function chunk(chunks: readonly WavChunk[], id: string): Buffer | undefined {
  return chunks.find((candidate) => candidate.id === id)?.body;
}

/**
 * Joins WAVs that share one format into a single WAV.
 *
 * The format bodies must be byte-identical, not merely compatible. Sample rate,
 * channel count, and bit depth all live in there, and any of the three
 * differing makes the join meaningless -- so comparing the whole body is both
 * the strictest check and the cheapest one to write correctly.
 */
export function concatenateWav(parts: readonly Uint8Array[]): Uint8Array {
  if (parts.length === 0) {
    throw new Error("concatenateWav needs at least one part; an episode with no audio is a bug");
  }

  let format: Buffer | undefined;
  const bodies: Buffer[] = [];

  parts.forEach((part, index) => {
    const chunks = readWavChunks(part);
    if (chunks === null) {
      throw new Error(`part ${index} is not a RIFF/WAVE file (${part.byteLength} bytes)`);
    }

    const fmt = chunk(chunks, "fmt ");
    const data = chunk(chunks, "data");
    if (fmt === undefined) throw new Error(`part ${index} has no fmt chunk`);
    if (data === undefined) throw new Error(`part ${index} has no data chunk`);

    if (format === undefined) {
      format = fmt;
    } else if (!format.equals(fmt)) {
      throw new Error(
        `part ${index} has a different audio format from part 0; ` +
          "refusing to join segments that would play back wrong",
      );
    }

    bodies.push(data);
  });

  // `format` is assigned on the first iteration and `parts` is non-empty, but
  // the compiler cannot see that through forEach.
  if (format === undefined) throw new Error("no format chunk found");

  const data = Buffer.concat(bodies);
  const fmtSize = format.length + (format.length % 2);
  const header = Buffer.alloc(12 + 8 + fmtSize + 8);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + 8 + fmtSize + 8 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(format.length, 16);
  format.copy(header, 20);
  header.write("data", 20 + fmtSize, "ascii");
  header.writeUInt32LE(data.length, 24 + fmtSize);

  return new Uint8Array(Buffer.concat([header, data]));
}
