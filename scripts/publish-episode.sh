#!/usr/bin/env bash
#
# Encode a generated episode and put it where the site expects it.
#
# The pipeline writes `episode.wav` because assembly needs a container it can
# join sample-accurately. That file is 13 MB for five minutes, which is fine on
# disk and absurd over a reader's connection: the same audio as 32 kbps mono AAC
# is 1.1 MB, and speech at this bitrate is indistinguishable from the original
# through the laptop speakers anyone will actually use.
#
# Usage:
#   scripts/publish-episode.sh .podcast/module-06-mcp/<run>/episode.wav module-06-mcp
#
# Writes apps/handbook/public/podcast/<slug>.m4a for local development, and
# prints the wrangler command to upload the same file to R2 for production.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 <episode.wav> <slug>" >&2
  echo "  e.g. $0 .podcast/module-06-mcp/2026-08-17T22-06-38Z-9bdb69/episode.wav module-06-mcp" >&2
  exit 2
fi

source_wav="$1"
slug="$2"
root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="$root/apps/handbook/public/podcast"
out="$out_dir/$slug.m4a"

if [ ! -f "$source_wav" ]; then
  echo "no such file: $source_wav" >&2
  exit 1
fi

mkdir -p "$out_dir"

# afconvert ships with macOS, which is already required for the local synthesis
# runner (mlx-audio is Apple silicon only), so this adds no new dependency.
afconvert -f m4af -d aac -b 32000 "$source_wav" "$out"

# The duration the page must claim. A player labelled with a length it does not
# have is a small lie the reader catches immediately.
#
# Rounded, not truncated: 273.7 seconds is 4:34 to every player that will show
# it, and `%d` in awk truncates, which is how the hand-written first label and
# this script came to disagree by a second.
seconds=$(afinfo "$out" | awk '/estimated duration/ { printf "%.0f", $3 }')
printf -v runtime '%d:%02d' $((seconds / 60)) $((seconds % 60))

echo
echo "  wrote     $out ($(du -h "$out" | cut -f1))"
echo "  duration  $runtime"
echo
echo "  Page usage:"
echo "    <EpisodePlayer file=\"$slug.m4a\" duration=\"$runtime\" model=\"...\" generated=\"$(date +%F)\" />"
echo
echo "  Upload to R2 for production:"
echo "    npx wrangler r2 object put handbook-podcast/$slug.m4a \\"
echo "      --file $out \\"
echo "      --content-type audio/mp4 --cache-control 'public, max-age=3600' --remote"
echo
# An hour, not a year: the filename is stable across regenerations, so an
# immutable cache would pin a corrected episode out of reach for as long as it
# lived at the edge.
echo "  (max-age is an hour because regenerating an episode reuses this filename)"
