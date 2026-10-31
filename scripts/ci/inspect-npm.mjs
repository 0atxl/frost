// Inspect the actual npm tarball only on GitHub Actions.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

assert.equal(process.env.GITHUB_ACTIONS, "true", "Run package inspection only in GitHub Actions");
const output = path.resolve(process.argv[2]);
const [packed] = JSON.parse(await readFile(path.join(output, "pack.json"), "utf8"));
const archive = path.join(output, packed.filename);
const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
const allowed = /^(?:package\/(?:package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES\.json|bin\/frost\.js|docs\/(?:distribution|npm-publishing)\.md)|package\/build\/(?:server\/[^/]+\.(?:js|py)|shared\/[^/]+\.js)|package\/(?:dist|notices)\/(?!.*(?:^|\/)\.{1,2}(?:\/|$)).+)$/;
assert.equal(new Set(entries).size, entries.length, "No duplicate tar entries");
for (const entry of entries) {
  assert(allowed.test(entry), `Unexpected package entry: ${entry}`);
  assert(!entry.split("/").some((part) => part.startsWith(".") || /^(?:access\.json|AGENTS\.md|CLAUDE\.md|credentials(?:\..*)?)$/.test(part)), `Private file: ${entry}`);
  assert(!/\.(?:map|ts|tsx|tgz|log|pem|key)$/.test(entry), `Development or secret file: ${entry}`);
}
const types = execFileSync("tar", ["-tvzf", archive], { encoding: "utf8" }).trim().split("\n");
assert(types.every((entry) => entry.startsWith("-")), "Only regular files belong in the package");
assert.deepEqual(entries.map((entry) => entry.slice(8)).sort(), packed.files.map((entry) => entry.path).sort());
for (const required of ["package.json", "LICENSE", "README.md", "bin/frost.js", "build/server/index.js", "build/server/data-dir.js", "build/server/desktop.py", "dist/index.html", "dist/theme.js", "notices/INTER-LICENSE.txt", "THIRD_PARTY_NOTICES.json"]) {
  assert(entries.includes(`package/${required}`), `Missing runtime file: ${required}`);
}
assert(entries.some((entry) => /^package\/dist\/assets\/.+\.js$/.test(entry)));
const metadata = JSON.parse(execFileSync("tar", ["-xOzf", archive, "package/package.json"], { encoding: "utf8" }));
assert.equal(metadata.name, "@0atxl/frost");
assert.equal(metadata.private, undefined);
assert.equal(metadata.license, "MIT");
assert.deepEqual(metadata.bin, { frost: "bin/frost.js" });
assert.deepEqual(metadata.os, ["linux"]);
assert.equal(metadata.engines.node, ">=22.13");
assert.equal(metadata.publishConfig.access, "public");
assert.equal(metadata.publishConfig.registry, "https://registry.npmjs.org/");
assert.equal(metadata.repository.url, "git+https://github.com/0atxl/frost.git");
assert(!metadata.scripts.prepare && !metadata.scripts.prepack && !metadata.scripts.install && !metadata.scripts.postinstall, "Installation must use the prebuilt app");
const launcher = execFileSync("tar", ["-xOzf", archive, "package/bin/frost.js"], { encoding: "utf8" });
assert(launcher.startsWith("#!/usr/bin/env node\n"));
await rename(archive, path.join(output, "frost-package.tgz"));
const bytes = await readFile(path.join(output, "frost-package.tgz"));
await writeFile(path.join(output, "SHA256SUMS"), `${createHash("sha256").update(bytes).digest("hex")}  frost-package.tgz\n`);
await writeFile(path.join(output, "package-files.txt"), entries.join("\n") + "\n");
await writeFile(path.join(output, "BUILD-INFO.txt"), `${metadata.name}@${metadata.version}\nCommit: ${process.env.GITHUB_SHA}\nNode: ${process.version}\nRun: https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}\n`);
console.log(`Inspected ${metadata.name}@${metadata.version}: ${entries.length} allowlisted files, ${bytes.length} bytes.`);
console.log(entries.join("\n"));
