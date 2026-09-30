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
#              or whose work is finished: every commit is on origin/main,
#              nothing is uncommitted, and either its branch has a merged PR
#              or it has no branch. The desktop app detaches HEAD when it
#              archives a session, and auto-archive runs on merge, so the
#              session never gets a turn to clean up after itself.
#   - shutdown any other booted sim. Its data is kept and the owning session
#              just boots it again.
#
# Only devices named `Ante · *` are considered, so the main checkout's sim and
# stock simulators are never touched by the steps above.
#
# Then it clears other build leftovers that nothing else removes:
#
#   - Xcode DerivedData (~4 GB each) for an Ante workspace whose checkout no
#     longer exists, or is a finished worktree with no build running. Xcode
#     keeps it forever otherwise.
#   - simulators whose runtime is gone (`simctl delete unavailable`). They
#     can't boot and can hold several GB.
#   - cached dev builds in ~/Library/Caches/ante-dev/builds beyond the newest
#     3. Each is ~270 MB, one per native fingerprint. A cache hit touches its
#     folder, so this keeps the most recently used.
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

# Finished = no commits beyond origin/main, clean tree, and a merged PR for the
# branch or no branch at all (detached by the app on archive).
finished() {
  local path=$1 branch=$2
  [ -z "$(git -C "$path" status --porcelain 2>/dev/null)" ] || return 1
  git -C "$path" merge-base --is-ancestor HEAD origin/main 2>/dev/null || return 1
  [ -n "$branch" ] || return 0
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
        echo "delete    $name (${branch:+${branch#claude/} }merged, nothing uncommitted)"
        delete "$udid"
      elif [ "$state" = Booted ]; then
        echo "shutdown  $name (idle)"
        run xcrun simctl shutdown "$udid"
      else
        echo "keep      $name (already shut down)"
      fi
    done

# DerivedData for an Ante workspace whose checkout is gone, or is a finished
# worktree nothing is building from. Checks the checkout, not ios/, which
# `prebuild --clean` briefly removes.
for d in "$HOME"/Library/Developer/Xcode/DerivedData/Ante-*; do
  [ -d "$d" ] || continue
  ws=$(/usr/libexec/PlistBuddy -c 'Print :WorkspacePath' "$d/info.plist" 2>/dev/null || true)
  [ -n "$ws" ] || continue
  checkout=${ws%/ios/*}
  name=$(basename "$checkout")
  if [ ! -d "$checkout" ]; then
    echo "delete    DerivedData $(basename "$d") ($checkout gone)"
    run rm -rf "$d"
    continue
  fi
  wt=$(awk -F'\t' -v p="$checkout" '$2 == p' <<<"$worktrees" | head -1)
  [ -n "$wt" ] && [ "$name" != "$own" ] || continue
  grep -F "/worktrees/$name/" <<<"$procs" | grep -qE 'expo|metro|xcodebuild' && continue
  finished "$checkout" "$(cut -f3 <<<"$wt")" || continue
  echo "delete    DerivedData $(basename "$d") ($name finished)"
  run rm -rf "$d"
done

if [ -n "$(xcrun simctl list devices unavailable | grep -F '(')" ]; then
  echo "delete    simulators with a missing runtime"
  run xcrun simctl delete unavailable
fi

builds="$HOME/Library/Caches/ante-dev/builds"
if [ -d "$builds" ]; then
  ls -dt "$builds"/*/ 2>/dev/null | tail -n +4 | while read -r b; do
    echo "delete    cached build $(basename "$b") (not among the 3 most recent)"
    run rm -rf "$b"
  done
fi
