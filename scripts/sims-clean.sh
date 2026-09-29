#!/usr/bin/env bash
# Usage: scripts/sims-clean.sh [--dry-run] [<own-worktree-name>]
#
# Tidies up the per-worktree `Ante · <name>` simulators that worktree-setup
# creates, so they don't pile up booted (RAM) and on disk (~3 GB each):
#
#   - delete   a sim whose worktree no longer appears in `git worktree list`.
#   - shutdown a booted sim whose worktree is idle: no Metro / expo / xcodebuild
#              process running from it, and booted for 30+ minutes (the grace
#              period covers setup, before Metro starts). Its data is kept and
#              the owning session just boots it again.
#   - keep     everything else, plus the caller's own sim (defaults to the
#              current worktree's name).
#
# Only devices named `Ante · *` are considered, so the main checkout's sim and
# stock simulators are never touched.
set -euo pipefail

dry_run=false
[ "${1:-}" = --dry-run ] && { dry_run=true; shift; }

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
own="${1:-$(basename "$root")}"
grace_secs=$((30 * 60))

worktrees=$(git -C "$root" worktree list --porcelain | sed -n 's|^worktree .*/||p')
procs=$(ps -axo etime=,command=)

# ps etime is [[dd-]hh:]mm:ss.
etime_secs() {
  local t=$1 d=0 h=0 m s
  case $t in *-*) d=${t%%-*}; t=${t#*-} ;; esac
  IFS=: read -r a b c <<<"$t"
  if [ -n "${c:-}" ]; then h=$a m=$b s=$c; else m=$a s=$b; fi
  echo $((10#$d * 86400 + 10#$h * 3600 + 10#$m * 60 + 10#$s))
}

run() { if $dry_run; then echo "    (dry run) $*"; else "$@" >/dev/null 2>&1 || true; fi; }

xcrun simctl list -j devices \
  | jq -r '.devices[][] | select(.name | startswith("Ante · ")) | [.udid, .state, (.name | ltrimstr("Ante · "))] | @tsv' \
  | while IFS=$'\t' read -r udid state name; do
      if [ "$name" = "$own" ]; then
        echo "keep      $name (own sim)"
      elif ! grep -qxF "$name" <<<"$worktrees"; then
        echo "delete    $name (worktree gone)"
        run xcrun simctl shutdown "$udid"
        run xcrun simctl delete "$udid"
      elif [ "$state" != Booted ]; then
        echo "keep      $name (already shut down)"
      elif grep -F "/worktrees/$name/" <<<"$procs" | grep -qE 'expo|metro|xcodebuild'; then
        echo "keep      $name (Metro or a build is running)"
      else
        booted=$(grep -F "launchd_sim" <<<"$procs" | grep -F "$udid" | awk '{print $1}' | head -1)
        if [ -n "$booted" ] && [ "$(etime_secs "$booted")" -lt "$grace_secs" ]; then
          echo "keep      $name (booted $booted ago)"
        else
          echo "shutdown  $name (idle)"
          run xcrun simctl shutdown "$udid"
        fi
      fi
    done
