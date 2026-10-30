import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { latestRelease, releaseHtml } from "./release-data.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
await rm(path.join(root, "dist"), { recursive: true, force: true });
await mkdir(path.join(root, "dist"), { recursive: true });
for (const entry of [
  "index.html",
  "styles.css",
  "demo.js",
  "page-vapour.js",
  "page-scene.js",
  "vapour.js",
  "vapour-shaders.js",
  "assets",
]) {
  await cp(path.join(root, entry), path.join(root, "dist", entry), {
    recursive: true,
  });
}
const release = await latestRelease();
await writeFile(path.join(root, "dist", "release.json"), JSON.stringify(release, null, 2) + "\n");
await writeFile(path.join(root, "dist", "index.html"),
  releaseHtml(await readFile(path.join(root, "index.html"), "utf8"), release));
console.log(release.available ? `Public download: Frost ${release.version}` : `Source installation: ${release.reason}`);
