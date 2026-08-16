"""
Kokoro-82M via mlx-audio, adapted to the single-file `{out}` contract.

`createLocalTts` reads exactly the path it substituted into `{out}` and treats a
missing file as a named error. `mlx_audio.tts.generate` writes
`{file_prefix}_000.wav`, `_001.wav`, ... per segment, or `{file_prefix}.wav`
with --join_audio. It never writes the path you hand it. Something has to
bridge the two, and a wrapper is the honest place: teaching the port to glob for
whatever a runner felt like writing would make "it produced nothing" undetectable.

Setup, on Apple silicon:

    uv venv && uv pip install mlx-audio "misaki[en]"
    brew install espeak-ng

The brew step is not optional and not obvious. `espeakng-loader` (0.2.0-0.2.4,
all of them) ships a dylib that ignores the data path passed to
`espeak_Initialize` and hard-exits on the path baked in at its build:
`/Users/runner/work/espeakng-loader/...`. It is not a phonemizer bug; a bare
ctypes call reproduces it. Point the loader at a real espeak-ng instead:

    cd .venv/lib/python3.13/site-packages/espeakng_loader
    mv libespeak-ng.dylib libespeak-ng.dylib.broken
    mv espeak-ng-data espeak-ng-data.broken
    ln -s /opt/homebrew/lib/libespeak-ng.dylib libespeak-ng.dylib
    ln -s /opt/homebrew/share/espeak-ng-data espeak-ng-data

Then, from the package directory:

    node --experimental-strip-types ../../packages/podcast-providers/src/bench.ts \
      --name kokoro-82m --command .venv/bin/python \
      --args "-u,runners/kokoro_mlx.py,--text,{text},--out,{out},--voice,{voice},--speed,{speed},--lang,{language}" \
      --voice af_heart --save /tmp/sample.wav
"""

import argparse
import os
import shutil
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory

started = time.perf_counter()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--text", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--voice", default="af_heart")
parser.add_argument("--speed", type=float, default=1.0)
parser.add_argument("--lang", default="en-US")
parser.add_argument("--model", default="mlx-community/Kokoro-82M-bf16")
args = parser.parse_args()

# "default" is the port's placeholder for "caller did not choose"; Kokoro has
# no such voice and would fail on it.
voice = "af_heart" if args.voice == "default" else args.voice
# The port speaks BCP-47 ("en-US"); Kokoro wants the primary subtag.
lang = args.lang.split("-")[0]

# Imported after argument parsing so a usage error costs no model load.
from mlx_audio.tts.generate import generate_audio  # noqa: E402

imported = time.perf_counter()

with TemporaryDirectory() as work:
    generate_audio(
        text=args.text,
        model=args.model,
        voice=voice,
        speed=args.speed,
        lang_code=lang,
        output_path=work,
        file_prefix="segment",
        audio_format="wav",
        join_audio=True,
        verbose=False,
    )

    # join_audio writes `{prefix}.wav`, but some paths through generate_audio
    # still emit numbered segments. Accept either rather than assuming, and say
    # so when the join did not happen — silently shipping segment 0 would be a
    # short episode with no error anywhere.
    produced = sorted(Path(work).glob("segment*.wav"))
    if not produced:
        sys.exit(f"{args.model} wrote no wav into {work}")
    if len(produced) > 1:
        sys.exit(
            f"{args.model} left {len(produced)} unjoined segments; "
            f"refusing to ship the first one as the whole call"
        )

    os.makedirs(Path(args.out).parent, exist_ok=True)
    shutil.copyfile(produced[0], args.out)

done = time.perf_counter()
# The port measures wall clock per call, which folds in both of these. Printing
# the split is what shows the fixed cost to be model load rather than synthesis.
print(
    f"timing import={imported - started:.2f}s "
    f"synthesis={done - imported:.2f}s total={done - started:.2f}s",
    file=sys.stderr,
)
