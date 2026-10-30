import test from "node:test";
import assert from "node:assert/strict";
// Build-only module; the website needs no application dependencies.
// @ts-expect-error JavaScript build module has no TypeScript declarations.
import { latestRelease, releaseHtml } from "../landing/release-data.mjs";

const base = "https://github.com/0atxl/frost";
const tag = "v0.1.0";
const hash = "a".repeat(64);
const asset = (name: string) => ({ name, state: "uploaded", size: 100,
  browser_download_url: `${base}/releases/download/${tag}/${name}`,
  digest: `sha256:${hash}` });
function fixture(overrides = {}, repository = { private: false, visibility: "public" }, checksum = `${hash}  frost-0.1.0-linux-x64.tar.gz\n`) {
  const release = { tag_name: tag, draft: false, prerelease: false,
    html_url: `${base}/releases/tag/${tag}`,
    assets: [asset("frost-0.1.0-linux-x64.tar.gz"), asset("SHA256SUMS")], ...overrides };
  return async (url: string, options: { headers: Record<string, string> }) => {
    assert(!("Authorization" in options.headers));
    if (url.endsWith("/releases/latest")) return new Response(JSON.stringify(release));
    if (url.endsWith("/SHA256SUMS")) return new Response(checksum);
    return new Response(JSON.stringify(repository));
  };
}
test("landing embeds anonymous stable assets with verified checksums and no credentials", async () => {
  const result = await latestRelease(fixture());
  assert.equal(result.available, true);
  assert.equal(result.version, "0.1.0");
  assert.equal(result.assets[0].sha256, hash);
  const html = releaseHtml('<a href="#install" data-release-button>Install from source</a><!-- release-status -->', result);
  assert(html.includes(`${base}/releases/download/${tag}/frost-0.1.0-linux-x64.tar.gz`));
  assert(html.includes("SHA-256 checksums"));
});
test("landing refuses drafts, prereleases, private repositories, incomplete assets and bad hashes", async () => {
  for (const request of [
    fixture({ draft: true }), fixture({ prerelease: true }), fixture({ tag_name: "v0.1.1-rc.1" }),
    fixture({}, { private: true, visibility: "private" }), fixture({ assets: [] }),
    fixture({}, undefined, "bad checksum"), fixture({}, undefined, `${"b".repeat(64)}  frost-0.1.0-linux-x64.tar.gz\n`),
    async () => new Response("not found", { status: 404 }),
    async () => { throw new Error("credential-must-not-appear"); },
  ]) {
    const result = await latestRelease(request);
    assert.equal(result.available, false);
    assert.deepEqual(result.assets, []);
    assert(!JSON.stringify(result).includes("credential-must-not-appear"));
    assert(releaseHtml('<!-- release-status -->', result).includes("No public binary download"));
  }
});
