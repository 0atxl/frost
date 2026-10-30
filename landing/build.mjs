import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
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
