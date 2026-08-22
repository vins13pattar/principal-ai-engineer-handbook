#!/usr/bin/env bash
#
# Take a generated run to published: encode, upload, and place the transcript.
#
# The pipeline writes `episode.wav` because assembly needs a container it can
# join sample-accurately. That file is 13 MB for five minutes, which is fine on
# disk and absurd over a reader's connection: the same audio as 32 kbps mono AAC
# is a fifth of a megabyte per minute, and speech at this bitrate is
# indistinguishable through the laptop speakers anyone will actually use.
#
# Everything after encoding used to be three commands and a hand edit, and the
# hand edit is where the mistakes happened -- a duration typed from memory that
# was a second off, and a transcript dropped into `content/docs/` where Astro
# validates it as a documentation page and the build dies. Both are now
# mechanical.
#
# Usage:
#   scripts/publish-episode.sh .podcast/module-07-langgraph/<run> module-07-langgraph
#
# Pass --no-upload to skip R2 (encode and place the transcript only).
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <run-directory> <slug> [--no-upload]" >&2
  echo "  e.g. $0 .podcast/module-07-langgraph/2026-08-22T13-00-00Z-abc123 module-07-langgraph" >&2
  exit 2
fi

run_dir="$1"
slug="$2"
upload=1
[ "${3:-}" = "--no-upload" ] && upload=0

root="$(cd "$(dirname "$0")/.." && pwd)"
source_wav="$run_dir/episode.wav"
source_md="$run_dir/transcript.md"
out_dir="$root/apps/handbook/public/podcast"
out="$out_dir/$slug.m4a"
transcript_out="$root/apps/handbook/src/transcripts/$slug.md"

for required in "$source_wav" "$source_md"; do
  if [ ! -f "$required" ]; then
    echo "no such file: $required" >&2
    exit 1
  fi
done

mkdir -p "$out_dir" "$(dirname "$transcript_out")"

# afconvert ships with macOS, which is already required for the local synthesis
# runner (mlx-audio is Apple silicon only), so this adds no new dependency.
afconvert -f m4af -d aac -b 32000 "$source_wav" "$out"

# Rounded, not truncated: 273.7 seconds is 4:34 to every player that will show
# it, and awk's `%d` truncates -- which is how a hand-written label and this
# script once disagreed by a second.
seconds=$(afinfo "$out" | awk '/estimated duration/ { printf "%.0f", $3 }')
printf -v runtime '%d:%02d' $((seconds / 60)) $((seconds % 60))

# The page copy drops the transcript's own header -- the player states all of it
# already -- and demotes headings one level so the page keeps a single H1 and
# its own outline.
awk '
  /^---$/ && !body { body = 1; next }        # skip everything down to the first rule
  !body { next }
  /^---$/ { next }                            # beat separators; the headings already separate
  /^## / { sub(/^## /, "### ") }
  { print }
' "$source_md" | awk 'NF || prev { print; prev = NF }' > "$transcript_out"

if [ "$upload" -eq 1 ]; then
  npx wrangler r2 object put "handbook-podcast/$slug.m4a" \
    --file "$out" \
    --content-type audio/mp4 --cache-control 'public, max-age=3600' --remote >/dev/null
  uploaded="uploaded to R2"
else
  uploaded="not uploaded (--no-upload)"
fi

model=$(awk -F'\\*\\*' '/Written by:/ { print $2 }' "$source_md" | sed 's/Written by: *//;s/ on .*//')
generated=$(awk '/Written by:/ { print $NF }' "$source_md")

echo
echo "  audio       $out ($(du -h "$out" | cut -f1)) — $uploaded"
echo "  transcript  $transcript_out"
echo "  duration    $runtime"
echo
echo "  Add to the page:"
echo
echo "    import { Content as Transcript } from \"../../../../transcripts/$slug.md\";"
echo
echo "    <EpisodePlayer file=\"$slug.m4a\" duration=\"$runtime\" model=\"${model:-Claude Sonnet 5}\" generated=\"${generated:-$(date +%F)}\">"
echo "      <Transcript slot=\"transcript\" />"
echo "    </EpisodePlayer>"
