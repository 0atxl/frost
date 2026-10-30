// Run only on GitHub runners, inside scripts/ci/desktop-session.sh.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, readlink, chmod, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";

const fixture = await mkdtemp(path.join(process.env.TMPDIR, "extracted-package-"));
let child;
async function stop() {
  if (!child || child.exitCode !== null) return;
  const processToStop = child;
  await new Promise((resolve) => { processToStop.once("exit", resolve); processToStop.kill("SIGTERM"); });
  child = undefined;
}
try {
  const archive = path.resolve(process.argv[2]);
  const names = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
  assert(names.every((name) => !name.startsWith("/") && !name.split("/").includes("..")));
  assert(!names.some((name) => /(^|\/)(\.agent-notes|\.env[^/]*|\.git|\.aws|\.codex|\.agents|\.frost-data|access\.json)(\/|$)/.test(name)));
  execFileSync("tar", ["-xzf", archive, "-C", fixture]);
  const installed = path.join(fixture, names[0].split("/")[0]);
  const require = createRequire(path.join(installed, "package.json"));
  const sharp = require("sharp");
  const files = path.join(fixture, "files");
  const elsewhere = path.join(fixture, "unrelated directory");
  await mkdir(files);
  await mkdir(elsewhere);
  await writeFile(path.join(files, "notes.txt"), "isolated package fixture");
  await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toFile(path.join(files, "photo.png"));
  const shortcut = path.join(elsewhere, "frost link");
  await symlink(path.join(installed, "frost"), shortcut);
  // The normal user must run successfully even when installation is read-only.
  execFileSync("chmod", ["-R", "a-w", installed]);
  const env = { ...process.env, FROST_ROOT: files, FROST_START_PATH: files, PORT: "0", PATH: "/usr/bin:/bin" };
  delete env.FROST_DATA_DIR;
  async function launch(cwd, overrides = {}) {
    let output = "";
    child = spawn(shortcut, { cwd, env: { ...env, ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Launcher exited: ${output}`);
      try {
        const links = await Promise.all((await readdir(`/proc/${child.pid}/fd`)).map((fd) =>
          readlink(`/proc/${child.pid}/fd/${fd}`).catch(() => "")));
        const sockets = new Set(links.map((link) => /^socket:\[(\d+)\]$/.exec(link)?.[1]));
        const listeners = (await readFile(`/proc/${child.pid}/net/tcp`, "utf8")).trim().split("\n").slice(1)
          .map((line) => line.trim().split(/\s+/)).filter((row) => row[3] === "0A" && sockets.has(row[9]));
        if (listeners.length) {
          assert.equal(listeners.length, 1);
          const [address, port] = listeners[0][1].split(":");
          assert.equal(address, "0100007F", "The package must bind only IPv4 loopback");
          assert.equal(await readlink(`/proc/${child.pid}/exe`), path.join(installed, "runtime/bin/node"));
          return `http://127.0.0.1:${parseInt(port, 16)}`;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await delay(100);
    }
    throw new Error(`No loopback listener: ${output}`);
  }
  let base = await launch(elsewhere);
  const html = await (await fetch(base)).text();
  assert.match(html, /<html/);
  const asset = /(?:src|href)="(\/assets\/[^" ]+\.js)"/.exec(html);
  assert(asset, "Compiled frontend JavaScript must be served");
  assert.equal((await fetch(base + asset[1])).status, 200);
  assert.equal((await fetch(base + "/api/list")).status, 401);
  const unlock = await fetch(base + "/api/auth/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "package-fixture-key", setup: true }) });
  assert.equal(unlock.status, 200);
  const cookie = unlock.headers.get("set-cookie").split(";")[0];
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  const session = await (await fetch(base + "/api/session", { headers })).json();
  headers["X-Frost-Token"] = session.token;
  const listing = await fetch(base + `/api/list?path=${encodeURIComponent(files)}`, { headers });
  assert.equal(listing.status, 200);
  assert.match(await listing.text(), /notes.txt/);
  const thumbnail = await fetch(base + `/api/thumbnail?path=${encodeURIComponent(path.join(files, "photo.png"))}`, { headers });
  assert.equal(thumbnail.status, 200);
  assert.match(thumbnail.headers.get("content-type"), /image\/webp/);
  assert((await thumbnail.arrayBuffer()).byteLength > 0);
  assert.equal((await fetch(base + "/api/devices", { headers })).status, 200);
  assert.equal((await fetch(base + "/api/trash", { headers })).status, 200);
  const state = path.join(process.env.XDG_DATA_HOME, "frost");
  const credentials = await readFile(path.join(state, "access.json"), "utf8");
  await stop();
  base = await launch(elsewhere);
  assert.equal((await (await fetch(base + "/api/auth/status")).json()).setupRequired, false);
  assert.equal(await readFile(path.join(state, "access.json"), "utf8"), credentials);
  await stop();
  // Existing source-install state takes priority, including legacy Trash.
  const legacy = path.join(elsewhere, ".frost-data");
  await mkdir(path.join(legacy, "trash"), { recursive: true });
  await writeFile(path.join(legacy, "access.json"), credentials);
  await writeFile(path.join(legacy, "trash", "keep.txt"), "keep legacy data");
  base = await launch(elsewhere);
  assert.equal((await (await fetch(base + "/api/auth/status")).json()).setupRequired, false);
  await stop();
  assert.equal(await readFile(path.join(legacy, "trash", "keep.txt"), "utf8"), "keep legacy data");
  base = await launch(elsewhere, { FROST_DATA_DIR: "explicit-state" });
  assert.equal((await (await fetch(base + "/api/auth/status")).json()).setupRequired, true);
  await stop();
  assert.equal(await readFile(path.join(legacy, "access.json"), "utf8"), credentials);
  console.log("Extracted archive passed: bundled runtime, read-only install, symlink, static UI, lock, file API, Sharp, Python/GIO/GVfs, state preservation.");
} finally {
  await stop();
  // Undo only the fixture's read-only installation before deleting it.
  execFileSync("chmod", ["-R", "u+w", fixture]);
  await rm(fixture, { recursive: true, force: true });
}
