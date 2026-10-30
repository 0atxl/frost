import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { get } from "node:http";
import sharp from "sharp";
import { createApp, byteRange } from "../server/app.js";

test("byte ranges support media seeking and reject invalid ranges", () => {
  assert.deepEqual(byteRange("bytes=0-4", 10), { start: 0, end: 4 });
  assert.deepEqual(byteRange("bytes=5-", 10), { start: 5, end: 9 });
  assert.deepEqual(byteRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.throws(() => byteRange("bytes=10-12", 10));
  assert.throws(() => byteRange("bytes=0-1,4-5", 10));
  assert.throws(() => byteRange("bytes=-0", 10));
  assert.throws(() => byteRange("bytes=0-", 0));
});
test("HTTP API enforces local origins, sessions, mutation tokens, safe content, and byte ranges", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "frost-http-")),
    root = path.join(temp, "files");
  await fs.mkdir(root);
  const file = path.join(root, "notes.txt");
  await fs.writeFile(file, "0123456789");
  const image = path.join(root, "photo.png");
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toFile(image);
  await fs.writeFile(
    path.join(root, "unsafe.html"),
    "<script>alert(1)</script>",
  );
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const { server } = await createApp({
    root,
    dataDir: path.join(temp, "state"),
    initialPath: root,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  assert.equal((await fetch(base + "/api/list")).status, 401);
  assert.equal((await fetch(base + "/api/session")).status, 401);
  assert.deepEqual(await (await fetch(base + "/api/auth/status")).json(), {
    setupRequired: true,
    unlocked: false,
    idleMinutes: 0,
  });
  assert.equal(
    (
      await fetch(base + "/api/session", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const rejectedHost = await new Promise<number | undefined>(
    (resolve, reject) => {
      get(
        base + "/api/session",
        { headers: { Host: "evil.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      ).on("error", reject);
    },
  );
  assert.equal(rejectedHost, 403);
  assert.equal(
    (
      await fetch(base + "/api/session", {
        headers: { "Sec-Fetch-Site": "cross-site" },
      })
    ).status,
    403,
  );
  const unlocked = await fetch(base + "/api/auth/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ key: "http-test-key", setup: true }),
  });
  assert.equal(unlocked.status, 200);
  assert.deepEqual(await unlocked.json(), {
    setupRequired: false,
    unlocked: true,
    idleMinutes: 0,
  });
  const setCookie = unlocked.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(";")[0];
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  const response = await fetch(base + "/api/session", { headers });
  assert.equal(response.status, 200);
  const session = (await response.json()) as { token: string };
  assert.match(session.token, /^[a-f0-9]{64}$/);
  assert.equal((await fetch(base + "/api/list", { headers })).status, 200);
  assert.equal(
    (
      await fetch(base + "/api/folders", {
        method: "POST",
        headers,
        body: JSON.stringify({ parent: root, name: "blocked" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/folders", {
        method: "POST",
        headers: { ...headers, "X-Frost-Token": session.token },
        body: JSON.stringify({ parent: root, name: "created" }),
      })
    ).status,
    201,
  );
  const range = await fetch(
    base + `/api/file?${new URLSearchParams({ path: file })}`,
    { headers: { ...headers, Range: "bytes=2-5" } },
  );
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await range.text(), "2345");
  const invalid = await fetch(
    base + `/api/file?${new URLSearchParams({ path: file })}`,
    { headers: { ...headers, Range: "bytes=99-" } },
  );
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), "bytes */10");
  const html = await fetch(
    base +
      `/api/file?${new URLSearchParams({ path: path.join(root, "unsafe.html") })}`,
    { headers },
  );
  assert.equal(html.headers.get("content-type"), "application/octet-stream");
  assert.match(html.headers.get("content-disposition")!, /^attachment/);
  assert.match(html.headers.get("content-security-policy")!, /sandbox/);
  const escape = await fetch(
    base +
      `/api/text?${new URLSearchParams({ path: path.join(root, "..", "state") })}`,
    { headers },
  );
  assert.equal(escape.status, 403);
  const thumbnailUrl =
    base + `/api/thumbnail?${new URLSearchParams({ path: image })}`;
  const thumbnail = await fetch(thumbnailUrl, { headers });
  assert.equal(thumbnail.status, 200);
  assert.equal(thumbnail.headers.get("content-type"), "image/webp");
  assert.equal(thumbnail.headers.get("cache-control"), "no-store");
  assert.ok((await thumbnail.arrayBuffer()).byteLength > 0);
  const found = await fetch(
    base +
      `/api/find?${new URLSearchParams({ path: root, mode: "contents", query: "234" })}`,
    { headers },
  );
  assert.equal(found.status, 200);
  const results = (await found.json()) as {
    results: { relativePath: string; line: number }[];
  };
  assert.deepEqual(
    results.results.map((result) => [result.relativePath, result.line]),
    [["notes.txt", 1]],
  );

  const secondUnlock = await fetch(base + "/api/auth/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "http-test-key" }),
  });
  assert.equal(secondUnlock.status, 200);
  const secondCookie = secondUnlock.headers.get("set-cookie")!.split(";")[0];
  const secondSession = (await (
    await fetch(base + "/api/session", {
      headers: { Cookie: secondCookie },
    })
  ).json()) as { token: string };
  assert.notEqual(secondSession.token, session.token);
  const mutation = { method: "POST", body: "{}" };
  assert.equal(
    (
      await fetch(base + "/api/auth/lock", {
        ...mutation,
        headers,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/auth/lock", {
        ...mutation,
        headers: { ...headers, "X-Frost-Token": secondSession.token },
      })
    ).status,
    403,
  );
  const locked = await fetch(base + "/api/auth/lock", {
    ...mutation,
    headers: { ...headers, "X-Frost-Token": session.token },
  });
  assert.equal(locked.status, 200);
  assert.equal((await fetch(thumbnailUrl, { headers })).status, 401);
  assert.match(locked.headers.get("set-cookie")!, /Max-Age=0/);
  for (const Cookie of [cookie, secondCookie]) {
    for (const endpoint of [
      "/api/session",
      "/api/list",
      "/api/find?mode=names&query=notes",
      `/api/thumbnail?${new URLSearchParams({ path: file })}`,
      `/api/file?${new URLSearchParams({ path: file })}`,
    ]) {
      assert.equal(
        (await fetch(base + endpoint, { headers: { Cookie } })).status,
        401,
      );
    }
  }
  const reopened = await fetch(base + "/api/auth/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "http-test-key" }),
  });
  assert.equal(reopened.status, 200);
  const freshHeaders = {
    Cookie: reopened.headers.get("set-cookie")!.split(";")[0],
  };
  assert.equal(
    (await fetch(base + "/api/list", { headers: freshHeaders })).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/api/folders", {
        method: "POST",
        headers: {
          ...freshHeaders,
          "Content-Type": "application/json",
          "X-Frost-Token": session.token,
        },
        body: JSON.stringify({ parent: root, name: "stale-token" }),
      })
    ).status,
    403,
  );
});
