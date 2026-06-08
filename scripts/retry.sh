#!/usr/bin/env bash
# retry.sh — run a command, retrying on failure with linear backoff.
#
# Usage:   bash scripts/retry.sh <max_attempts> -- <command> [args...]
# Example: bash scripts/retry.sh 3 -- npx electron-builder --linux AppImage --publish always
#
# Why: electron-builder downloads helper binaries (e.g. appimage-*.7z) from
# GitHub's CDN at build time. A transient HTTP 504 there fails the whole release
# job (it did for v0.12.4). Retrying absorbs CDN blips so a release doesn't need a
# manual re-run. See docs/rca / docs/qa/test-plan.md (packaging flakiness).
#
# Backoff between attempts is `attempt * RETRY_BASE_DELAY` seconds
# (RETRY_BASE_DELAY defaults to 20; set 0 in tests for speed).
set -u

max="${1:?usage: retry.sh <max_attempts> -- <command...>}"
shift
[ "${1:-}" = "--" ] && shift
[ "$#" -ge 1 ] || { echo "retry: no command given" >&2; exit 2; }

base="${RETRY_BASE_DELAY:-20}"
attempt=1
while true; do
  if "$@"; then
    exit 0
  fi
  if [ "$attempt" -ge "$max" ]; then
    echo "::error::retry: '$*' failed after ${attempt} attempt(s)" >&2
    exit 1
  fi
  delay=$(( attempt * base ))
  echo "::warning::retry: attempt ${attempt} of '$*' failed; retrying in ${delay}s" >&2
  [ "$delay" -gt 0 ] && sleep "$delay"
  attempt=$(( attempt + 1 ))
done
