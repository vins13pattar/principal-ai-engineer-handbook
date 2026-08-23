#!/usr/bin/env bash
#
# Turn a run directory's transcript into the copy the page imports.
#
# The page copy drops the transcript's own header -- the player states all of it
# already -- and demotes headings one level so the page keeps a single H1 and
# its own outline.
#
# Its own script because two callers need it: publishing a new episode, and
# re-rendering an existing one after a change to the renderer. Inlined in both,
# the two copies would drift.
#
# Usage:
#   scripts/page-transcript.sh <source.md> <out.md>
set -euo pipefail

source_md="${1:?usage: page-transcript.sh <source.md> <out.md>}"
out="${2:?usage: page-transcript.sh <source.md> <out.md>}"

awk '
  /^---$/ && !body { body = 1; next }        # skip everything down to the first rule
  !body { next }
  /^---$/ { next }                            # beat separators; the headings already separate
  /^## / { sub(/^## /, "### ") }
  { print }
' "$source_md" | awk 'NF || prev { print; prev = NF }' > "$out"
