import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const tag = process.env.RELEASE_TAG;
const commit = process.env.RELEASE_COMMIT;
if (!repository || !token || !/^v\d+\.\d+\.\d+$/.test(tag) || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid release inputs");
const version = JSON.parse(await readFile("package.json", "utf8")).version;
if (tag !== `v${version}`) throw new Error("Tag must match package version");
await readFile("LICENSE", "utf8");
if (execFileSync("git", ["rev-parse", `${tag}^{commit}`], { encoding: "utf8" }).trim() !== commit) throw new Error("Tag moved");
const root = `https://api.github.com/repos/${repository}`;
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28", ...options.headers }, signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Release request failed: HTTP ${response.status}`);
  return response.json();
}
const notes = `Frost ${version} for Linux x64\n\nBuilt from ${commit} on Ubuntu 22.04, glibc 2.35. Bundles Node.js 24 and production dependencies. Requires system Python 3, PyGObject, GIO/GVfs and a desktop D-Bus session. See INSTALL.md in the archive. Verify downloads with SHA256SUMS. No automatic updates.\n\n<!-- frost-release-commit:${commit} -->`;
const known = await fetch(`${root}/releases/tags/${tag}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
let release;
if (known.status === 404) {
  release = await api(`${root}/releases`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_name: tag, target_commitish: commit, name: `Frost ${version}`, body: notes, draft: true, prerelease: false }) });
} else if (known.ok) {
  release = await known.json();
  if (!release.draft) throw new Error("Version is already published. Refusing to replace assets; use Website redeploy to recover the hook.");
  if (!release.body?.includes(`<!-- frost-release-commit:${commit} -->`)) throw new Error("Draft belongs to another commit or publisher; refusing to modify it.");
} else throw new Error(`Cannot inspect existing release: HTTP ${known.status}`);
const names = [ `frost-${version}-linux-x64.tar.gz`, `frost-${version}-source.tar.gz`, "SHA256SUMS" ];
if ((await readdir("release-output")).sort().join("\n") !== [...names].sort().join("\n")) throw new Error("Unexpected release output");
// A recoverable draft may contain partial uploads. Reuse byte-identical assets;
// refuse mismatches instead of silently replacing a previous run's output.
for (const name of names) {
  const bytes = await readFile(`release-output/${name}`);
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const existing = release.assets.find((asset) => asset.name === name);
  if (existing) {
    if (existing.state !== "uploaded" || existing.size !== bytes.length || existing.digest !== digest) {
      throw new Error(`Draft asset ${name} differs. Re-run the failed jobs using the original build artifact, or explicitly delete the unpublished draft and retry.`);
    }
    continue;
  }
  const asset = await api(`${release.upload_url.split("{")[0]}?name=${encodeURIComponent(name)}`, {
    method: "POST", headers: { "Content-Type": name.endsWith(".gz") ? "application/gzip" : "text/plain" }, body: bytes,
  });
  if (asset.state !== "uploaded" || asset.size !== bytes.length || asset.digest !== digest) throw new Error(`Upload verification failed: ${name}`);
}
release = await api(`${root}/releases/${release.id}`);
if (release.assets.length !== names.length || !names.every((name) => release.assets.some((asset) => asset.name === name && asset.state === "uploaded"))) throw new Error("Incomplete or unexpected release assets");
// Make an older recovery release stable without overriding a newer latest release.
await api(`${root}/releases/${release.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ draft: false, prerelease: false, make_latest: "legacy" }) });
console.log(`Published https://github.com/${repository}/releases/tag/${tag}`);
