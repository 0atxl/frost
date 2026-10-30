import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import {
  clearThumbnailCache,
  requestThumbnail,
  thumbnailKey,
} from "../src/lib/thumbnail-cache.js";
import type { FileEntry } from "../shared/types.js";

function image(name: string): FileEntry {
  return {
    name,
    path: `/files/${name}`,
    kind: "image",
    extension: "png",
    mime: "image/png",
    size: 100,
    modified: "2026-10-30T00:00:00Z",
    created: "2026-10-30T00:00:00Z",
    isSymlink: false,
    accessible: true,
    writable: true,
  };
}

function fixture(t: test.TestContext) {
  clearThumbnailCache();
  t.after(clearThumbnailCache);
  const calls: {
    signal: AbortSignal;
    resolve: (response: Response) => void;
  }[] = [];
  t.mock.method(globalThis, "fetch", (_url: string, options: RequestInit) => {
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    return new Promise<Response>((resolve) =>
      calls.push({ signal: options.signal!, resolve }),
    );
  });
  return calls;
}

test("tab thumbnail cache shares requests, limits concurrency to two, and keys file versions", async (t) => {
  const calls = fixture(t);
  const first = image("first.png");
  const loaded: Blob[] = [];
  const subscriber = () => ({
    loaded: (blob: Blob) => loaded.push(blob),
    failed: () => assert.fail("thumbnail should load"),
  });
  requestThumbnail(first, subscriber());
  requestThumbnail(first, subscriber());
  requestThumbnail(image("second.png"), subscriber());
  requestThumbnail(image("third.png"), subscriber());
  assert.equal(calls.length, 2);
  calls[0].resolve(new Response("first"));
  await setImmediate();
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0], loaded[1]);
  assert.equal(calls.length, 3);
  calls[1].resolve(new Response("second"));
  calls[2].resolve(new Response("third"));
  await setImmediate();
  requestThumbnail(first, subscriber());
  assert.equal(calls.length, 3);
  assert.equal(loaded.length, 5);
  assert.notEqual(
    thumbnailKey(first),
    thumbnailKey({ ...first, size: first.size + 1 }),
  );
  const updated = { ...first, modified: "2026-10-30T00:01:00Z" };
  assert.notEqual(thumbnailKey(first), thumbnailKey(updated));
  requestThumbnail(updated, subscriber());
  assert.equal(calls.length, 4);
  calls[3].resolve(new Response("updated"));
  await setImmediate();
  assert.equal(await loaded.at(-1)!.text(), "updated");
});

test("locking aborts tab requests and late responses cannot populate the fresh cache", async (t) => {
  const calls = fixture(t);
  const file = image("private.png");
  const stale: Blob[] = [];
  requestThumbnail(file, {
    loaded: (blob) => stale.push(blob),
    failed: () => assert.fail("aborted job should be silent"),
  });
  clearThumbnailCache();
  assert.equal(calls[0].signal.aborted, true);
  const fresh: Blob[] = [];
  const subscriber = () => ({
    loaded: (blob: Blob) => fresh.push(blob),
    failed: () => assert.fail("fresh job should load"),
  });
  requestThumbnail(file, subscriber());
  assert.equal(calls.length, 2);
  calls[0].resolve(new Response("stale"));
  calls[1].resolve(new Response("fresh"));
  await setImmediate();
  assert.equal(stale.length, 0);
  assert.equal(fresh.length, 1);
  requestThumbnail(file, subscriber());
  assert.equal(calls.length, 2);
  assert.equal(await fresh[1].text(), "fresh");
});

test("unsubscribing cancels unused thumbnail work and failures can be retried", async (t) => {
  const calls = fixture(t);
  const file = image("retry.png");
  const cancel = requestThumbnail(file, {
    loaded: () => assert.fail("cancelled"),
    failed: () => assert.fail("cancelled"),
  });
  cancel();
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve(new Response("cancelled"));
  await setImmediate();
  let failures = 0;
  requestThumbnail(file, {
    loaded: () => assert.fail("invalid response"),
    failed: () => failures++,
  });
  calls[1].resolve(new Response("unavailable", { status: 415 }));
  await setImmediate();
  assert.equal(failures, 1);
  const loaded: Blob[] = [];
  requestThumbnail(file, {
    loaded: (blob) => loaded.push(blob),
    failed: () => assert.fail("retry should load"),
  });
  calls[2].resolve(new Response("recovered"));
  await setImmediate();
  assert.equal(await loaded[0].text(), "recovered");
});
