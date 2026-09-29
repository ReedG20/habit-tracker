#!/usr/bin/env bash
# Usage: scripts/sims-clean.sh [--dry-run] [<own-worktree-name>]
#
# Tidies up the per-worktree `Ante · <name>` simulators that worktree-setup
# creates, so they don't pile up booted (RAM) and on disk (~3 GB each):
#
#   - keep     the caller's own sim (defaults to the current worktree's name),
#              and any sim in use: Metro / expo / xcodebuild running from its
#              worktree, or booted less than 30 minutes ago (covers setup,
#              before Metro starts).
#   - delete   a sim whose worktree no longer appears in `git worktree list`,
#              or whose work is finished: its branch has a merged PR, every
#              commit is on origin/main, and nothing is uncommitted.
#   - shutdown any other booted sim. Its data is kept and the owning session
#              just boots it again.
#
# Only devices named `Ante · *` are considered, so the main checkout's sim and
# stock simulators are never touched.
set -euo pipefail

dry_run=false
[ "${1:-}" = --dry-run ] && { dry_run=true; shift; }

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
own="${1:-$(basename "$root")}"
grace_secs=$((30 * 60))

git -C "$root" fetch -q origin main 2>/dev/null || true
# One line per worktree: <name> <path> <branch>
worktrees=$(git -C "$root" worktree list --porcelain | awk '
  /^worktree / { path = substr($0, 10); n = split(path, parts, "/"); name = parts[n]; branch = "" }
  /^branch /   { branch = substr($0, 19) }
  /^$/         { print name "\t" path "\t" branch }
  END          { if (path != "") print name "\t" path "\t" branch }' | sort -u)
procs=$(ps -axo etime=,command=)

# ps etime is [[dd-]hh:]mm:ss.
etime_secs() {
  local t=$1 d=0 h=0 m s
  case $t in *-*) d=${t%%-*}; t=${t#*-} ;; esac
  IFS=: read -r a b c <<<"$t"
  if [ -n "${c:-}" ]; then h=$a m=$b s=$c; else m=$a s=$b; fi
  echo $((10#$d * 86400 + 10#$h * 3600 + 10#$m * 60 + 10#$s))
}

# Finished = merged PR for the branch, no commits beyond origin/main, clean tree.
finished() {
  local path=$1 branch=$2
  [ -n "$branch" ] || return 1
  [ -z "$(git -C "$path" status --porcelain 2>/dev/null)" ] || return 1
  git -C "$path" merge-base --is-ancestor HEAD origin/main 2>/dev/null || return 1
  [ "$(cd "$root" && gh pr list --head "$branch" --state merged --json number --jq length 2>/dev/null)" \
    -gt 0 ] 2>/dev/null
}

run() { if $dry_run; then echo "    (dry run) $*"; else "$@" >/dev/null 2>&1 || true; fi; }

delete() {
  run xcrun simctl shutdown "$1"
  run xcrun simctl delete "$1"
}

xcrun simctl list -j devices \
  | jq -r '.devices[][] | select(.name | startswith("Ante · ")) | [.udid, .state, (.name | ltrimstr("Ante · "))] | @tsv' \
  | while IFS=$'\t' read -r udid state name; do
      wt=$(awk -F'\t' -v n="$name" '$1 == n' <<<"$worktrees" | head -1)
      path=$(cut -f2 <<<"$wt")
      branch=$(cut -f3 <<<"$wt")
      booted=$(grep -F "launchd_sim" <<<"$procs" | grep -F "$udid" | awk '{print $1}' | head -1 || true)

      if [ "$name" = "$own" ]; then
        echo "keep      $name (own sim)"
      elif [ -z "$wt" ]; then
        echo "delete    $name (worktree gone)"
        delete "$udid"
      elif grep -F "/worktrees/$name/" <<<"$procs" | grep -qE 'expo|metro|xcodebuild'; then
        echo "keep      $name (Metro or a build is running)"
      elif [ -n "$booted" ] && [ "$(etime_secs "$booted")" -lt "$grace_secs" ]; then
        echo "keep      $name (booted $booted ago)"
      elif finished "$path" "$branch"; then
        echo "delete    $name (${branch#claude/} merged, nothing uncommitted)"
        delete "$udid"
      elif [ "$state" = Booted ]; then
        echo "shutdown  $name (idle)"
        run xcrun simctl shutdown "$udid"
      else
        echo "keep      $name (already shut down)"
      fi
    done
