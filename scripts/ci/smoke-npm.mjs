// Run only in GitHub Actions, using an isolated XDG/D-Bus session.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

assert.equal(process.env.GITHUB_ACTIONS, "true", "Run installation checks only in GitHub Actions");
const prefix = path.resolve(process.argv[2]);
const installed = path.join(prefix, "lib/node_modules/@0atxl/frost");
const fixture = await mkdtemp(path.join(process.env.TMPDIR, "npm-smoke-"));
const require = createRequire(path.join(installed, "package.json"));
const metadata = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"));
const commandEnv = { ...process.env, PATH: `${prefix}/bin:${process.env.PATH}` };
delete commandEnv.NODE_PATH;
delete commandEnv.NODE_OPTIONS;
delete commandEnv.FROST_DATA_DIR;
const command = "frost";
assert.equal(await realpath(path.join(prefix, "bin/frost")), path.join(installed, "bin/frost.js"));
assert.equal(execFileSync(command, ["--version"], { env: commandEnv, cwd: fixture, encoding: "utf8" }).trim(), metadata.version);
assert.match(execFileSync(command, ["--help"], { env: commandEnv, cwd: fixture, encoding: "utf8" }), /Usage: frost/);
assert.throws(() => require.resolve("tsx"), "Installation must not depend on development tools");
assert.throws(() => require.resolve("vite"));
const sharp = require("sharp");
let child;
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const previous = child;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { previous.kill("SIGKILL"); reject(new Error("Frost did not stop")); }, 5000);
    previous.once("exit", () => { clearTimeout(timer); resolve(); });
    previous.kill("SIGTERM");
  });
  child = undefined;
}
try {
  const files = path.join(fixture, "files");
  const elsewhere = path.join(fixture, "unrelated directory");
  const another = path.join(fixture, "another directory");
  await mkdir(files);
  await mkdir(elsewhere);
  await mkdir(another);
  await writeFile(path.join(files, "notes.txt"), "npm tarball installation");
  await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toFile(path.join(files, "photo.png"));
  // Runtime must work without writes to a globally installed package.
  execFileSync("chmod", ["-R", "a-w", installed]);
  async function launch(cwd, overrides = {}) {
    let output = "";
    let spawnError;
    child = spawn(command, { cwd, env: { ...commandEnv, FROST_ROOT: files, FROST_START_PATH: files, PORT: "0", FROST_DEV: "1", ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
    child.on("error", (error) => { spawnError = error; });
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`frost exited: ${output}`);
      const match = /Frost is running at (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) {
        const listeners = (await readFile(`/proc/${child.pid}/net/tcp`, "utf8")).trim().split("\n").slice(1).map((line) => line.trim().split(/\s+/));
        const port = Number(new URL(match[1]).port).toString(16).toUpperCase().padStart(4, "0");
        assert(listeners.some((row) => row[1] === `0100007F:${port}` && row[3] === "0A"), "Frost must listen on IPv4 loopback");
        return match[1];
      }
      await delay(100);
    }
    throw new Error(`No frost listener: ${output}`);
  }
  let base = await launch(elsewhere);
  const html = await (await fetch(base)).text();
  assert.match(html, /<html/);
  const asset = /(?:src|href)="(\/assets\/[^" ]+\.js)"/.exec(html);
  assert(asset, "Compiled UI must be served even with FROST_DEV=1");
  assert.equal((await fetch(base + asset[1])).status, 200);
  assert.equal((await fetch(base + "/theme.js")).status, 200);
  assert.equal((await fetch(base + "/api/list")).status, 401);
  const unlock = await fetch(base + "/api/auth/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "npm-fixture-key", setup: true }) });
  assert.equal(unlock.status, 200);
  const headers = { Cookie: unlock.headers.get("set-cookie").split(";")[0], "Content-Type": "application/json" };
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
  assert.equal((JSON.parse(credentials)).idleMinutes, 0);
  await stop();
  base = await launch(another);
  assert.equal((await (await fetch(base + "/api/auth/status")).json()).setupRequired, false);
  assert.equal(await readFile(path.join(state, "access.json"), "utf8"), credentials);
  await stop();
  // Both legacy discovery paths retain credentials, settings and old Trash.
  for (const legacy of [path.join(elsewhere, ".frost-data"), path.join(installed, ".frost-data")]) {
    await chmod(installed, 0o755);
    await mkdir(path.join(legacy, "trash"), { recursive: true });
    await writeFile(path.join(legacy, "access.json"), credentials);
    await writeFile(path.join(legacy, "settings.json"), '{"keep":true}');
    await writeFile(path.join(legacy, "trash/keep.txt"), "legacy Trash stays here");
    await chmod(installed, 0o555);
    base = await launch(elsewhere);
    assert.equal((await (await fetch(base + "/api/auth/status")).json()).setupRequired, false);
    await stop();
    assert.equal(await readFile(path.join(legacy, "access.json"), "utf8"), credentials);
    assert.equal(await readFile(path.join(legacy, "settings.json"), "utf8"), '{"keep":true}');
    assert.equal(await readFile(path.join(legacy, "trash/keep.txt"), "utf8"), "legacy Trash stays here");
    await chmod(installed, 0o755);
    await rm(legacy, { recursive: true });
    await chmod(installed, 0o555);
  }
  base = await launch(elsewhere, { FROST_DATA_DIR: "explicit state" });
  assert.equal((await (await fetch(base + "/api/auth/status")).json()).setupRequired, true);
  await stop();
  assert.equal(await readFile(path.join(state, "access.json"), "utf8"), credentials);
  const fallbackHome = path.join(fixture, "fallback home");
  base = await launch(elsewhere, { HOME: fallbackHome, XDG_DATA_HOME: "" });
  assert.equal((await (await fetch(base + "/api/auth/status")).json()).setupRequired, true);
  await stop();
  assert((await realpath(path.join(fallbackHome, ".local/share/frost"))).startsWith(fixture));
  console.log("npm tarball passed: global frost symlink, read-only install, unrelated cwd, compiled UI, authentication, file API, Sharp, Python/GIO/GVfs, stable state, legacy state, explicit data path and HOME fallback.");
} finally {
  await stop();
  execFileSync("chmod", ["-R", "u+w", prefix]);
  await rm(fixture, { recursive: true, force: true });
  await rm(prefix, { recursive: true, force: true });
}
