import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileSystem } from "../server/filesystem.js";

async function fixture(t: test.TestContext) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "frost-test-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "files"),
    data = path.join(temp, "state");
  await fs.mkdir(root);
  const files = new FileSystem(root, data);
  await files.initialize();
  return { temp, root, data, files };
}
test("listing includes metadata, counts hidden files, and handles Unicode names", async (t) => {
  const { root, files } = await fixture(t);
  await fs.writeFile(path.join(root, "notes-日本語.md"), "hello");
  await fs.writeFile(path.join(root, ".hidden"), "secret");
  await fs.mkdir(path.join(root, "photos"));
  const result = await files.list(root);
  assert.equal(result.parent, null);
  assert.equal(result.entries.length, 2);
  assert.equal(result.hiddenCount, 1);
  assert.equal(
    result.entries.find((f) => f.name === "notes-日本語.md")?.kind,
    "text",
  );
  assert.equal(result.entries.find((f) => f.name === "photos")?.kind, "folder");
  assert.equal((await files.list(root, true)).entries.length, 3);
});
test("paths and symlinks cannot escape the configured root", async (t) => {
  const { temp, root, files } = await fixture(t);
  const external = path.join(temp, "outside");
  await fs.mkdir(external);
  await fs.writeFile(path.join(external, "private.txt"), "private");
  await fs.symlink(external, path.join(root, "escape"));
  await assert.rejects(files.list(path.join(root, "..")), /outside/);
  await assert.rejects(
    files.text(path.join(root, "escape", "private.txt")),
    /outside/,
  );
  const link = (await files.list(root)).entries.find(
    (f) => f.name === "escape",
  );
  assert.equal(link?.accessible, false);
  const moved = await files.trash([path.join(root, "escape")]);
  assert.equal(moved.errors.length, 1);
  assert.equal(
    await fs.readFile(path.join(external, "private.txt"), "utf8"),
    "private",
  );
});
test("rename preserves a symlink and does not rename its target", async (t) => {
  const { root, files } = await fixture(t);
  await fs.writeFile(path.join(root, "target.txt"), "original");
  await fs.symlink(path.join(root, "target.txt"), path.join(root, "link.txt"));
  await files.rename(path.join(root, "link.txt"), "renamed-link.txt");
  assert.equal(
    (await fs.lstat(path.join(root, "renamed-link.txt"))).isSymbolicLink(),
    true,
  );
  assert.equal(
    await fs.readFile(path.join(root, "target.txt"), "utf8"),
    "original",
  );
});
test("new folders and rename reject collisions and invalid names", async (t) => {
  const { root, files } = await fixture(t);
  await files.mkdir(root, "drafts");
  await fs.writeFile(path.join(root, "a.txt"), "A");
  await fs.writeFile(path.join(root, "b.txt"), "B");
  await assert.rejects(files.mkdir(root, "drafts"), /already exists/);
  await assert.rejects(files.mkdir(root, "../outside"), /slashes/);
  await assert.rejects(
    files.rename(path.join(root, "a.txt"), "b.txt"),
    /already exists/,
  );
  assert.equal(await fs.readFile(path.join(root, "a.txt"), "utf8"), "A");
  assert.equal(await fs.readFile(path.join(root, "b.txt"), "utf8"), "B");
  await files.rename(path.join(root, "a.txt"), "new name.txt");
  assert.equal(await fs.readFile(path.join(root, "new name.txt"), "utf8"), "A");
});
test("copy and move retain contents, report collisions, and reject recursive copies", async (t) => {
  const { root, files } = await fixture(t);
  await fs.mkdir(path.join(root, "source"));
  await fs.mkdir(path.join(root, "destination"));
  await fs.mkdir(path.join(root, "third"));
  await fs.writeFile(path.join(root, "source", "readme.txt"), "keep me");
  const copied = await files.transfer(
    [path.join(root, "source")],
    path.join(root, "destination"),
    "copy",
  );
  assert.equal(copied.completed.length, 1);
  assert.equal(
    await fs.readFile(
      path.join(root, "destination", "source", "readme.txt"),
      "utf8",
    ),
    "keep me",
  );
  const collision = await files.transfer(
    [path.join(root, "source")],
    path.join(root, "destination"),
    "copy",
  );
  assert.equal(collision.errors.length, 1);
  const recursive = await files.transfer(
    [path.join(root, "source")],
    path.join(root, "source"),
    "copy",
  );
  assert.equal(recursive.errors.length, 1);
  const moved = await files.transfer(
    [path.join(root, "source")],
    path.join(root, "third"),
    "move",
  );
  assert.equal(moved.completed.length, 1);
  await assert.rejects(fs.stat(path.join(root, "source")));
  assert.equal(
    await fs.readFile(path.join(root, "third", "source", "readme.txt"), "utf8"),
    "keep me",
  );
});
test("trash survives restart, restores contents, and never replaces a new original", async (t) => {
  const { root, data, files } = await fixture(t);
  const original = path.join(root, "report.txt");
  await fs.writeFile(original, "first");
  const result = await files.trash([original]);
  assert.equal(result.completed.length, 1);
  await assert.rejects(fs.stat(original));
  const restarted = new FileSystem(root, data);
  await restarted.initialize();
  const items = await restarted.listTrash();
  assert.equal(items.length, 1);
  assert.equal(items[0].originalPath, original);
  await fs.writeFile(original, "new");
  await assert.rejects(restarted.restore(items[0].id), /already exists/);
  assert.equal(await fs.readFile(original, "utf8"), "new");
  assert.equal((await restarted.listTrash()).length, 1);
  await fs.rename(original, path.join(root, "new-report.txt"));
  await restarted.restore(items[0].id);
  assert.equal(await fs.readFile(original, "utf8"), "first");
  assert.equal((await restarted.listTrash()).length, 0);
});
test("text preview is bounded and refuses binary data", async (t) => {
  const { root, files } = await fixture(t);
  const large = path.join(root, "large.log"),
    binary = path.join(root, "data.bin");
  await fs.writeFile(large, "A".repeat(300 * 1024));
  await fs.writeFile(binary, Buffer.from([0, 1, 2, 3, 4, 200, 255]));
  const text = await files.text(large);
  assert.equal(text.text.length, 256 * 1024);
  assert.equal(text.truncated, true);
  assert.deepEqual(await files.text(binary), {
    text: "",
    truncated: false,
    binary: true,
  });
});
test("concurrent requests cannot overwrite an existing destination", async (t) => {
  const { root, files } = await fixture(t);
  const results = await Promise.allSettled([
    files.mkdir(root, "same"),
    files.mkdir(root, "same"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
});
test("internal storage cannot be browsed or moved through the file API", async (t) => {
  const { root } = await fixture(t);
  const files = new FileSystem(root, path.join(root, ".state"));
  await files.initialize();
  assert.equal(
    (await files.list(root, true)).entries.some(
      (file) => file.name === ".state",
    ),
    false,
  );
  await assert.rejects(files.list(path.join(root, ".state")), /internal/);
  await assert.rejects(
    files.rename(path.join(root, ".state"), "other"),
    /internal/,
  );
});
