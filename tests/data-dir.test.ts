import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveDataDir } from "../server/data-dir.js";

test("data paths stay outside the installation and preserve legacy state in place", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "frost-state-"));
  try {
    const cwd = path.join(fixture, "working directory");
    const install = path.join(fixture, "installation");
    const home = path.join(fixture, "home");
    const xdg = path.join(fixture, "xdg");
    await mkdir(cwd);
    await mkdir(install);
    assert.equal(await resolveDataDir(install, {}, cwd, home), path.join(home, ".local/share/frost"));
    const stable = await resolveDataDir(install, { XDG_DATA_HOME: xdg }, cwd, home);
    assert.equal(stable, path.join(xdg, "frost"));
    assert.equal((await stat(stable)).mode & 0o777, 0o700);
    assert.equal(await resolveDataDir(install, { FROST_DATA_DIR: "custom state", XDG_DATA_HOME: "invalid" }, cwd, home), path.join(cwd, "custom state"));
    await assert.rejects(resolveDataDir(install, { XDG_DATA_HOME: "relative" }, cwd, home), /absolute/);
    const installedLegacy = path.join(install, ".frost-data");
    await mkdir(installedLegacy);
    assert.equal(await resolveDataDir(install, { XDG_DATA_HOME: xdg }, cwd, home), installedLegacy);
    const legacy = path.join(cwd, ".frost-data");
    await mkdir(path.join(legacy, "trash"), { recursive: true });
    await writeFile(path.join(legacy, "access.json"), "existing credentials");
    await writeFile(path.join(legacy, "trash", "keep.txt"), "legacy Trash");
    assert.equal(await resolveDataDir(install, { XDG_DATA_HOME: xdg }, cwd, home), legacy);
    assert.equal(await readFile(path.join(legacy, "access.json"), "utf8"), "existing credentials");
    assert.equal(await readFile(path.join(legacy, "trash", "keep.txt"), "utf8"), "legacy Trash");
    await rm(legacy, { recursive: true });
    await writeFile(legacy, "not a directory");
    await assert.rejects(resolveDataDir(install, {}, cwd, home), /not a directory/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
