#!/usr/bin/env bash
# PreToolUse(Bash) hook: keeps Claude sessions off shared Convex deployments.
# - `convex deploy` is denied everywhere (prod and shared dev deploy through CI).
# - In a git worktree, mutating Convex commands are denied while .env.local (or
#   the command) targets the shared dev deployment or prod. See the
#   worktree-setup skill for giving the worktree its own deployment.
set -uo pipefail

SHARED='cool-kiwi-961|whimsical-labrador-585'

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // "."' <<<"$input")

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

grep -Eq '\bconvex\b' <<<"$cmd" || exit 0

if grep -Eq '\bconvex[[:space:]]+deploy\b' <<<"$cmd"; then
  deny "convex deploy is blocked for Claude: prod and the shared dev deployment deploy through CI (docs/deploy.md). Ask Reed if a manual deploy is really needed."
fi

grep -Eq '\bconvex[[:space:]]+(dev|run|import|env[[:space:]]+(set|remove))\b' <<<"$cmd" || exit 0

git_dir=$(git -C "$cwd" rev-parse --git-dir 2>/dev/null) || exit 0
common_dir=$(git -C "$cwd" rev-parse --git-common-dir 2>/dev/null) || exit 0
[ "$(cd "$cwd" && cd "$git_dir" && pwd)" = "$(cd "$cwd" && cd "$common_dir" && pwd)" ] && exit 0 # main checkout

if grep -Eq -- "--deployment[= ]+[^ ]*($SHARED)|--prod\b" <<<"$cmd"; then
  deny "This worktree must not change the shared dev or prod Convex deployment. Target this worktree's own deployment instead (worktree-setup skill, step 1)."
fi

root=$(git -C "$cwd" rev-parse --show-toplevel)
if [ ! -f "$root/.env.local" ] || grep -Eq "^CONVEX_DEPLOYMENT=.*($SHARED)" "$root/.env.local"; then
  deny "This worktree's .env.local still points at the shared Convex dev deployment. Load the worktree-setup skill and do step 1 (create dev/wt-<name>) before running Convex commands."
fi
exit 0
