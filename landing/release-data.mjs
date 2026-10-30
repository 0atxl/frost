// This module runs at build time only. Public downloads must work anonymously.
const repository = "0atxl/frost";
const github = `https://github.com/${repository}`;
const api = `https://api.github.com/repos/${repository}`;
const stable = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export async function latestRelease(request = fetch) {
  const unavailable = (reason) => ({
    available: false, reason, version: null, releaseUrl: null,
    sourceUrl: github, assets: [], checksums: null,
  });
  const get = async (url, json = true) => {
    const response = await request(url, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "frost-landing-build" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return json ? response.json() : response.text();
  };
  try {
    const repo = await get(api);
    if (repo.private || repo.visibility !== "public") return unavailable("repository-private");
    const release = await get(`${api}/releases/latest`);
    if (release.draft || release.prerelease || !stable.test(release.tag_name)) {
      return unavailable("no-stable-release");
    }
    const version = release.tag_name.slice(1);
    const releaseUrl = `${github}/releases/tag/${release.tag_name}`;
    if (release.html_url !== releaseUrl) throw new Error("Unexpected release URL");
    const assets = release.assets.filter((asset) =>
      asset.state === "uploaded" && asset.size > 0 &&
      asset.browser_download_url === `${github}/releases/download/${release.tag_name}/${asset.name}`
    );
    const sums = assets.find((asset) => asset.name === "SHA256SUMS");
    if (!sums) return unavailable("no-downloadable-release");
    const hashes = new Map();
    for (const line of (await get(sums.browser_download_url, false)).trim().split("\n")) {
      const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
      if (!match || hashes.has(match[2])) throw new Error("Invalid checksum manifest");
      hashes.set(match[2], match[1]);
    }
    const downloads = assets.filter((asset) =>
      asset.name === `frost-${version}-linux-x64.tar.gz` && hashes.has(asset.name)
    ).map((asset) => {
      const sha256 = hashes.get(asset.name);
      if (asset.digest && asset.digest !== `sha256:${sha256}`) throw new Error("Checksum mismatch");
      return { name: asset.name, url: asset.browser_download_url, size: asset.size,
        platform: "linux-x64", baseline: "Ubuntu 22.04 x64 / glibc 2.35 or later", sha256 };
    });
    if (!downloads.length) return unavailable("no-downloadable-release");
    return { available: true, version, releaseUrl, sourceUrl: github,
      assets: downloads, checksums: { url: sums.browser_download_url, values: Object.fromEntries(hashes) } };
  } catch {
    // No response body, environment values, or credentials enter generated files/logs.
    return unavailable("github-unavailable");
  }
}

const escape = (value) => String(value).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function releaseHtml(html, release) {
  const download = release.assets[0];
  const button = release.available
    ? `href="${escape(download.url)}">Download for Linux x64`
    : 'href="#install">Install from source';
  const note = release.available
    ? `Frost ${escape(release.version)} for Linux x64. Ubuntu 22.04 / glibc 2.35 or later. Node.js is included. ` +
      `<a href="${escape(release.releaseUrl)}">Release notes</a> · <a href="${escape(release.checksums.url)}">SHA-256 checksums</a>`
    : 'No public binary download is available right now. Install from the public source repository below.';
  return html.replaceAll('href="#install" data-release-button>Install from source', button)
    .replace('<!-- release-status -->', note);
}
