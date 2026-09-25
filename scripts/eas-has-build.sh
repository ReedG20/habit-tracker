#!/usr/bin/env bash
# Usage: scripts/eas-has-build.sh <build-profile>
#
# Prints `true` when EAS has an iOS build for <build-profile> whose native
# fingerprint matches the checked-out code (finished, or still on its way), so
# an OTA update published from here can reach it; `false` when a new build is
# needed. The fingerprint is the same hash EAS stamps on a build
# (.fingerprintignore keeps the generated native folders out of it), and the
# app's runtimeVersion policy is `fingerprint`, so this is exactly the check
# expo-updates applies on the device.
set -euo pipefail

profile="${1:?usage: eas-has-build.sh <build-profile>}"

fp=$(bunx eas-cli@latest fingerprint:generate -p ios -e "$profile" --json)
hash=$(jq -r .hash <<<"$fp")
[ -n "$hash" ] && [ "$hash" != null ] || { echo "no fingerprint hash in: $fp" >&2; exit 1; }

builds=$(bunx eas-cli@latest build:list -p ios -e "$profile" --fingerprint-hash "$hash" \
  --json --non-interactive --limit 5)
matching=$(jq '[.[] | select(.status | IN("FINISHED","IN_PROGRESS","IN_QUEUE","NEW","PENDING"))] | length' <<<"$builds")

echo "$profile fingerprint=$hash matching builds=$matching" >&2
[ "$matching" -gt 0 ] && echo true || echo false
