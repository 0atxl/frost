import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppLock } from "../server/auth.js";

async function fixture(t: test.TestContext) {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "frost-lock-"));
  t.after(() => fs.rm(data, { recursive: true, force: true }));
  let clears = 0;
  const lock = new AppLock(data, () => clears++);
  await lock.initialize();
  return { data, lock, clears: () => clears };
}

test("lock setup stores only a restricted salted hash and restart requires unlocking", async (t) => {
  const { data, lock } = await fixture(t);
  assert.deepEqual(lock.status(""), {
    setupRequired: true,
    unlocked: false,
    idleMinutes: 0,
  });
  await assert.rejects(
    lock.unlock("release-key", false),
    /Create an access key/,
  );
  await assert.rejects(lock.unlock("abc", true), /at least 4/);
  const id = await lock.unlock("release-key", true);
  assert.equal(lock.status(id).unlocked, true);
  const contents = await fs.readFile(path.join(data, "access.json"), "utf8");
  assert.equal(contents.includes("release-key"), false);
  const stored = JSON.parse(contents);
  assert.match(stored.salt, /^[a-f0-9]{64}$/);
  assert.match(stored.hash, /^[a-f0-9]{128}$/);
  assert.equal(
    (await fs.stat(path.join(data, "access.json"))).mode & 0o777,
    0o600,
  );
  const restarted = new AppLock(data);
  await restarted.initialize();
  assert.equal(restarted.status(id).setupRequired, false);
  assert.equal(restarted.get(id), null);
  assert.ok(restarted.get(await restarted.unlock("release-key", false)));
});

test("failed unlocks are throttled and setup cannot replace an existing key", async (t) => {
  const { lock } = await fixture(t);
  await lock.unlock("release-key", true);
  t.mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  await assert.rejects(lock.unlock("wrong", true), { status: 401 });
  await assert.rejects(lock.unlock("release-key", false), { status: 429 });
  t.mock.timers.tick(1001);
  assert.ok(lock.get(await lock.unlock("release-key", false)));
});

test("manual lock and key changes revoke all sessions, close streams, and clear thumbnails", async (t) => {
  const { lock, clears } = await fixture(t);
  const first = await lock.unlock("release-key", true);
  const second = await lock.unlock("release-key", false);
  let stopped = 0;
  lock.streams.set(() => stopped++, first);
  lock.streams.set(() => stopped++, second);
  lock.lock();
  assert.equal(stopped, 2);
  assert.equal(lock.streams.size, 0);
  assert.equal(lock.get(first), null);
  assert.equal(lock.get(second), null);
  assert.equal(clears(), 1);
  const third = await lock.unlock("release-key", false);
  const fourth = await lock.unlock("release-key", false);
  lock.streams.set(() => stopped++, third);
  await lock.changeKey("release-key", "replacement-key");
  assert.equal(lock.get(third), null);
  assert.equal(lock.get(fourth), null);
  assert.equal(stopped, 3);
  assert.equal(clears(), 2);
  assert.ok(lock.get(await lock.unlock("replacement-key", false)));
  await assert.rejects(lock.unlock("release-key", false), { status: 401 });
});

test("idle expiry closes only the expired session and clears the cache after the last session", async (t) => {
  const { lock, clears } = await fixture(t);
  t.mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  const first = await lock.unlock("release-key", true);
  const second = await lock.unlock("release-key", false);
  await assert.rejects(lock.setIdle(1), /valid lock timeout/);
  await lock.setIdle(5);
  let stopped = 0;
  lock.streams.set(() => stopped++, first);
  t.mock.timers.tick(4 * 60_000);
  lock.touch(second);
  t.mock.timers.tick(60_000);
  lock.prune();
  assert.equal(lock.get(first), null);
  assert.ok(lock.get(second));
  assert.equal(stopped, 1);
  assert.equal(clears(), 0);
  t.mock.timers.tick(4 * 60_000);
  lock.prune();
  assert.equal(lock.get(second), null);
  assert.equal(clears(), 1);
});

test("the absolute twelve-hour expiry applies even with activity and idle locking disabled", async (t) => {
  const { lock, clears } = await fixture(t);
  t.mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  const id = await lock.unlock("release-key", true);
  t.mock.timers.tick(12 * 60 * 60_000 - 1);
  lock.touch(id);
  assert.ok(lock.get(id));
  t.mock.timers.tick(1);
  lock.prune();
  assert.equal(lock.get(id), null);
  assert.equal(clears(), 1);
});
