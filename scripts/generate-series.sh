#!/usr/bin/env bash
#
# Work through the handbook one page at a time, from the top.
#
# Not a batch command: it runs the same per-page steps you would run by hand, in
# order, and stops rather than pressing on through trouble. What it removes is
# sixty-one rounds of typing, not the one-page-at-a-time shape.
#
# Resumable by construction. A page is "done" when its transcript exists in
# `src/transcripts/`, so an interrupted run picks up where it stopped and a
# finished page is never paid for twice.
#
# Usage:
#   scripts/generate-series.sh [--limit N] [--dry-run]
#
# Env:
#   PODCAST_ENV_FILE  defaults to ~/.config/handbook/podcast.env
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

env_file="${PODCAST_ENV_FILE:-$HOME/.config/handbook/podcast.env}"
limit=0
dry_run=0

while [ $# -gt 0 ]; do
  case "$1" in
    --limit) limit="$2"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f "$env_file" ]; then
  echo "no credential file at $env_file" >&2
  exit 1
fi

# The order and the remaining set both come from episode-plan, so this script
# and the projection can never disagree about what is left.
#
# Read in a loop rather than with `mapfile`: macOS ships bash 3.2, where that
# builtin does not exist, and the script failed on its first run because of it.
queue=()
while IFS= read -r line; do
  [ -n "$line" ] && queue+=("$line")
done < <(node --experimental-strip-types scripts/episode-plan.ts --ids 2>/dev/null)

if [ "${#queue[@]}" -eq 0 ]; then
  echo "nothing left to generate"
  exit 0
fi

echo "${#queue[@]} pages remaining"
[ "$limit" -gt 0 ] && echo "stopping after $limit"
echo

done_count=0
fail_streak=0

for entry in "${queue[@]}"; do
  document_id="${entry%% *}"
  slug="${entry##* }"

  if [ "$limit" -gt 0 ] && [ "$done_count" -ge "$limit" ]; then
    echo "reached --limit $limit"
    break
  fi

  # Two consecutive failures means something systemic -- a dead endpoint, an
  # exhausted credit, a bad config -- and grinding through fifty more pages
  # would turn one problem into fifty identical ones.
  if [ "$fail_streak" -ge 2 ]; then
    echo "stopping: two failures in a row" >&2
    exit 1
  fi

  echo "=== $document_id ==="

  if [ "$dry_run" -eq 1 ]; then
    echo "  (dry run)"
    done_count=$((done_count + 1))
    continue
  fi

  if ! out=$(node --env-file="$env_file" --experimental-strip-types \
      packages/podcast-engine/src/cli.ts create "$document_id" --run 2>&1); then
    echo "  generate failed:" >&2
    echo "$out" | tail -4 >&2
    fail_streak=$((fail_streak + 1))
    continue
  fi

  # Everything after "wrote ", not field 2: this repository lives under a path
  # containing a space ("Open Source"), so awk's field splitting truncated it to
  # `/Users/vinod/Projects/Open` and two perfectly good episodes were reported
  # as missing their own output.
  run_dir=$(echo "$out" | sed -n 's|^ *wrote \(.*\)/episode\.wav$|\1|p' | tail -1)
  measured=$(echo "$out" | awk '/measured/ { print $NF }' | tail -1)
  echo "$out" | grep -E "^  (episode|script|reviewed)" | sed 's/^/  /'

  if [ -z "$run_dir" ] || [ ! -d "$run_dir" ]; then
    echo "  could not find the run directory in the output" >&2
    fail_streak=$((fail_streak + 1))
    continue
  fi

  if ! published=$(./scripts/publish-episode.sh "$run_dir" "$slug" 2>&1); then
    echo "  publish failed:" >&2
    echo "$published" | tail -4 >&2
    fail_streak=$((fail_streak + 1))
    continue
  fi

  runtime=$(echo "$published" | awk '/duration/ { print $2 }')
  model=$(echo "$published" | sed -n 's/.*model="\([^"]*\)".*/\1/p' | head -1)
  generated=$(echo "$published" | sed -n 's/.*generated="\([^"]*\)".*/\1/p' | head -1)

  if ! node --experimental-strip-types scripts/wire-episode.ts \
      "$document_id" "$slug" "$runtime" "${model:-Claude Sonnet 5}" "${generated:-$(date +%F)}" >/dev/null; then
    echo "  wiring the page failed" >&2
    fail_streak=$((fail_streak + 1))
    continue
  fi

  # Build after every page rather than at the end: a page that breaks the build
  # should be found next to the edit that broke it, not sixty edits later.
  if ! pnpm --filter @handbook/site build >/dev/null 2>&1; then
    echo "  the site no longer builds after wiring $document_id" >&2
    exit 1
  fi

  echo "  published $runtime  $measured"
  done_count=$((done_count + 1))
  fail_streak=0
done

echo
echo "$done_count published this run"
