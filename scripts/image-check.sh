#!/bin/bash
# image-check.sh <image>: the checks every runtime image passes before it ships (P0-14/P0-15, C-21; SECURITY §10).
# Used by CI's image job and by the production deploy on the image it actually ships (production build args).
#   1. Trivy (binary pinned by checksum, not the trivy-action: its tags were hijacked in 2026): blocks HIGH/CRITICAL
#      with a fix available, like OSV. No --skip-dirs: the runtime is Next standalone + bundled CLIs; packages
#      bundled into cli/*.mjs carry no package.json, so the lockfile OSV gate covers them (DECISIONS).
#   2. Slim runtime: the bundles parse, no package managers or dev dependencies, the release config is inside.
set -Eeuo pipefail
image=${1:?usage: image-check.sh <image>}
tmp=${RUNNER_TEMP:-$(mktemp -d)}

curl -sSfL -o "$tmp/trivy.tgz" https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_Linux-64bit.tar.gz
echo "c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0  $tmp/trivy.tgz" | sha256sum -c -
tar -xzf "$tmp/trivy.tgz" -C "$tmp" trivy
"$tmp/trivy" image --scanners vuln --ignore-unfixed --severity HIGH,CRITICAL --exit-code 1 --no-progress "$image"

# shellcheck disable=SC2016 # the script runs inside the container
docker run --rm --network none --entrypoint sh "$image" -c '
  set -e
  for f in cli/worker.mjs cli/relay.mjs cli/migrate.mjs cli/seed.mjs cli/demo-credentials.mjs server.js; do
    node --check "$f"
  done
  for t in npm npx pnpm corepack yarn tsx; do
    if command -v "$t" >/dev/null; then echo "unexpected tool in the runtime: $t"; exit 1; fi
  done
  if ls node_modules/.pnpm | grep -E "^(esbuild|@esbuild|lefthook|tsx|typescript|vitest|@playwright)"; then
    echo "dev dependency in the runtime"; exit 1
  fi
  for f in infra/compose/compose.yml infra/compose/staging.yml infra/compose/production.yml \
           infra/caddy/common.caddy infra/postgres/bootstrap.sql infra/redis/queue.conf infra/backup/checks.sql; do
    test -s "$f" || { echo "missing $f (moz-deploy reads the release config from the image)"; exit 1; }
  done
  echo "runtime is slim"'
