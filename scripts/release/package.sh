#!/usr/bin/env bash
set -euo pipefail
source scripts/release/node.env
version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json")).version')
commit=$(git rev-parse HEAD)
output="$PWD/release-output"
stage=$(mktemp -d "$RUNNER_TEMP/frost-package-XXXXXX")
trap 'rm -rf "$stage"' EXIT
name="frost-$version-linux-x64"
package="$stage/$name"
mkdir -p "$package/runtime/bin" "$output"

# These are the only repository paths that enter the installed binary package.
cp -R dist build "$package/"
cp package.json package-lock.json LICENSE README.md "$package/"
cp docs/distribution.md "$package/INSTALL.md"
install -m755 packaging/frost "$package/frost"
node scripts/release/notices.mjs "$package"
cp landing/assets/INTER-LICENSE.txt "$package/notices/INTER-LICENSE.txt"

curl --fail --silent --show-error --location --retry 3 \
  "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" \
  --output "$stage/node.tar.xz"
printf '%s  %s\n' "$NODE_SHA256" "$stage/node.tar.xz" | sha256sum --check --strict
tar -xJf "$stage/node.tar.xz" -C "$stage"
cp "$stage/node-v$NODE_VERSION-linux-x64/bin/node" "$package/runtime/bin/node"
cp "$stage/node-v$NODE_VERSION-linux-x64/LICENSE" "$package/runtime/LICENSE"
# A clean production install includes optional native dependencies for this OS.
SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci --prefix "$package" --omit=dev --include=optional --no-audit --no-fund
"$package/runtime/bin/node" --input-type=module - "$package" <<'JS'
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const require = createRequire(process.argv[2] + '/package.json');
const sharp = require('sharp');
const metadataAt = (name) => JSON.parse(readFileSync(process.argv[2] + '/node_modules/' + name + '/package.json', 'utf8'));
const metadata = metadataAt('sharp');
assert.equal(metadataAt('@img/sharp-linux-x64').version,
  metadata.optionalDependencies['@img/sharp-linux-x64']);
assert.equal(metadataAt('@img/sharp-libvips-linux-x64').version,
  metadata.optionalDependencies['@img/sharp-libvips-linux-x64']);
await sharp({create:{width:8,height:8,channels:3,background:'red'}}).webp().toBuffer();
JS
cat > "$package/BUILD-INFO.txt" <<EOF
Frost $version
Commit: $commit
Node: $NODE_VERSION
Build baseline: Ubuntu 22.04 x64, glibc 2.35
Runtime baseline: Linux x86-64, glibc >= 2.35, kernel >= 4.18, libstdc++
Desktop dependencies: system Python 3, PyGObject, GIO, GVfs, session D-Bus
EOF
tar -czf "$output/$name.tar.gz" -C "$stage" "$name"
# Source is from the same commit, never from an untracked working directory.
git archive --format=tar.gz --prefix="frost-$version/" --output="$output/frost-$version-source.tar.gz" HEAD
(cd "$output" && sha256sum "frost-$version-linux-x64.tar.gz" "frost-$version-source.tar.gz" > SHA256SUMS)
cat "$output/SHA256SUMS"
