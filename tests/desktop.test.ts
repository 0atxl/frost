import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileSystem } from "../server/filesystem.js";
import { DesktopFiles } from "../server/desktop.js";

test("GIO system Trash survives helper restarts, refuses overwrite, restores, and deletes a confirmed item", async (t) => {
  // CI supplies a private D-Bus session and temporary XDG directories.
  assert.ok(
    process.env.DBUS_SESSION_BUS_ADDRESS,
    "Run under dbus-run-session with isolated XDG state",
  );
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "frost-desktop-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "files");
  await fs.mkdir(root);
  const files = new FileSystem(root, path.join(temp, "state"));
  await files.initialize();
  const desktop = new DesktopFiles(files);
  const original = path.join(root, "report.txt");
  await fs.writeFile(original, "keep me");
  const trashed = await desktop.trash([original]);
  assert.deepEqual(trashed.errors, []);
  assert.deepEqual(trashed.completed, [original]);
  await assert.rejects(fs.stat(original), { code: "ENOENT" });
  const restarted = new DesktopFiles(files);
  const items = await restarted.listTrash();
  assert.equal(items.length, 1);
  assert.equal(items[0].originalPath, original);
  assert.equal(items[0].source, "system");
  await fs.writeFile(original, "new content");
  await assert.rejects(restarted.restore(items[0].id), /already exists/);
  assert.equal(await fs.readFile(original, "utf8"), "new content");
  await fs.rename(original, path.join(root, "new-report.txt"));
  await restarted.restore(items[0].id);
  assert.equal(await fs.readFile(original, "utf8"), "keep me");
  assert.equal((await restarted.listTrash()).length, 0);
  assert.equal((await restarted.trash([original])).errors.length, 0);
  const [confirmed] = await restarted.listTrash();
  assert.ok(confirmed);
  const unknown = await restarted.deleteTrash([
    "system:trash:///not-confirmed",
  ]);
  assert.equal(unknown.errors.length, 1);
  assert.equal((await restarted.listTrash()).length, 1);
  assert.deepEqual(await restarted.deleteTrash([confirmed.id]), {
    completed: [confirmed.id],
    errors: [],
  });
  assert.equal((await restarted.listTrash()).length, 0);
});
