import { readdir, readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Capture notices from the complete build tree, including dependencies bundled
// into frontend assets. Runtime node_modules also retains upstream notice files.
const destination = path.resolve(process.argv[2]);
const entries = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name === "package.json") {
      const metadata = JSON.parse(await readFile(file, "utf8"));
      if (metadata.name && metadata.version) entries.push({
        path: directory, name: metadata.name, version: metadata.version,
        license: metadata.license ?? "See upstream license files",
        repository: metadata.repository ?? null,
      });
    } else if (/^(licen[cs]e|notice|copying|copyright)([._-]|$)/i.test(entry.name)) {
      const target = path.join(destination, "notices", file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(file, target);
    }
  }
}
await walk("node_modules");
entries.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(path.join(destination, "THIRD_PARTY_NOTICES.json"), JSON.stringify(entries, null, 2) + "\n");
