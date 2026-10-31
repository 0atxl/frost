#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
if (args.length === 1 && ["--version", "-v"].includes(args[0])) {
  const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  console.log(metadata.version);
} else if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  console.log(`Usage: frost

Start Frost, then open http://127.0.0.1:4317. Stop with Ctrl+C.
Requires Linux, Node.js >=22.13, Python 3 with PyGObject, GIO/GVfs,
and your graphical desktop's session D-Bus. Run without sudo.

Environment: FROST_DATA_DIR, XDG_DATA_HOME, FROST_ROOT, FROST_START_PATH, PORT.
New data defaults to $XDG_DATA_HOME/frost or $HOME/.local/share/frost.
Existing .frost-data directories take priority. See docs/distribution.md.`);
} else if (args.length) {
  console.error("Unknown arguments. Run frost --help for usage.");
  process.exitCode = 1;
} else if (process.platform !== "linux") {
  console.error("Frost requires a Linux desktop with Python GObject and GIO/GVfs.");
  process.exitCode = 1;
} else if (process.getuid?.() === 0) {
  console.error("Run Frost as your normal desktop user, without sudo.");
  process.exitCode = 1;
} else {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    console.error("Frost requires Node.js >=22.13.");
    process.exitCode = 1;
  } else {
    delete process.env.FROST_DEV;
    await import("../build/server/index.js");
  }
}
