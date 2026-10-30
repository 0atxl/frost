import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ByteCache } from "../shared/byte-cache.js";
import { Thumbnails } from "../server/thumbnails.js";

test("thumbnail LRU respects payload and entry limits, replacement, and recently used entries", () => {
  const cache = new ByteCache<string>(6, 2);
  cache.set("a", "A", 3);
  cache.set("b", "B", 3);
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C", 3);
  assert.equal(cache.get("b"), undefined);
  cache.set("a", "new A", 1);
  cache.set("d", "D", 2);
  assert.equal(cache.get("c"), undefined);
  assert.equal(cache.get("a"), "new A");
  cache.set("huge", "too big", 7);
  assert.equal(cache.get("huge"), undefined);
  cache.deleteWhere((key) => key === "a");
  assert.equal(cache.get("a"), undefined);
  cache.clear();
  assert.equal(cache.get("d"), undefined);
  cache.set("full", "fits after clearing", 6);
  assert.equal(cache.get("full"), "fits after clearing");
  const byteBound = new ByteCache<string>(5);
  byteBound.set("a", "A", 3);
  byteBound.set("b", "B", 3);
  assert.equal(byteBound.get("a"), undefined);
  assert.equal(byteBound.get("b"), "B");
});

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frost-thumbnails-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "image.png");
  await sharp({
    create: { width: 800, height: 600, channels: 3, background: "red" },
  })
    .png()
    .toFile(file);
  return { root, file, thumbnails: new Thumbnails() };
}

test("server thumbnails deduplicate work, resize images, invalidate changed files, and clear on lock", async (t) => {
  const { file, thumbnails } = await fixture(t);
  const [first, shared] = await Promise.all([
    thumbnails.get(file),
    thumbnails.get(file),
  ]);
  assert.equal(first, shared);
  assert.equal(await thumbnails.get(file), first);
  const metadata = await sharp(first).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok(metadata.width! <= 400);
  assert.ok(metadata.height! <= 280);
  await sharp({
    create: { width: 30, height: 20, channels: 3, background: "blue" },
  })
    .png()
    .toFile(file);
  const updatedTime = new Date(Date.now() + 2000);
  await fs.utimes(file, updatedTime, updatedTime);
  const changed = await thumbnails.get(file);
  assert.notDeepEqual(changed, first);
  assert.equal((await sharp(changed).metadata()).width, 30);
  thumbnails.clear();
  const regenerated = await thumbnails.get(file);
  assert.notEqual(regenerated, changed);
  assert.deepEqual(regenerated, changed);
});

test("clearing thumbnails rejects stale in-flight work and invalid images do not poison the queue", async (t) => {
  const { root, file, thumbnails } = await fixture(t);
  const pending = thumbnails.get(file);
  thumbnails.clear();
  await assert.rejects(pending, { status: 401 });
  const invalid = path.join(root, "invalid.png");
  await fs.writeFile(invalid, "not an image");
  await assert.rejects(thumbnails.get(invalid));
  await assert.rejects(thumbnails.get(invalid));
  assert.ok((await thumbnails.get(file)).length > 0);
  const oversized = path.join(root, "oversized.png");
  await fs.writeFile(oversized, "");
  await fs.truncate(oversized, 100 * 1024 * 1024 + 1);
  await assert.rejects(thumbnails.get(oversized), { status: 413 });
});
