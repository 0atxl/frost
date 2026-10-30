import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileSystem } from "../server/filesystem.js";
import { findFiles } from "../server/find.js";

async function fixture(t: test.TestContext) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "frost-find-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "files");
  await fs.mkdir(root);
  const files = new FileSystem(root, path.join(root, ".state"));
  await files.initialize();
  const search = (
    query: string,
    options: Partial<Parameters<typeof findFiles>[1]> = {},
    signal = new AbortController().signal,
  ) =>
    findFiles(
      files,
      {
        path: root,
        query,
        mode: "names",
        recursive: false,
        hidden: false,
        ...options,
      },
      signal,
    );
  return { temp, root, files, search };
}

test("Find ranks exact names ahead of substring and fuzzy matches and respects folder scope", async (t) => {
  const { root, search } = await fixture(t);
  for (const name of [
    "report",
    "report.txt",
    "r-e-p-o-r-t.txt",
    ".report-hidden",
  ]) {
    await fs.writeFile(path.join(root, name), "text");
  }
  await fs.mkdir(path.join(root, "nested"));
  await fs.writeFile(path.join(root, "nested", "report-deep.txt"), "text");
  const direct = await search(" REPORT ");
  assert.deepEqual(
    direct.results.map((r) => r.relativePath),
    ["report", "report.txt", "r-e-p-o-r-t.txt"],
  );
  const recursive = await search("report", { recursive: true, hidden: true });
  assert.equal(recursive.results.length, 5);
  assert.ok(
    recursive.results.some((r) => r.relativePath === "nested/report-deep.txt"),
  );
  assert.ok(recursive.results.some((r) => r.relativePath === ".report-hidden"));
});

test("Find excludes private state, external targets, directory symlink traversal, and binary content", async (t) => {
  const { temp, root, search } = await fixture(t);
  await fs.writeFile(path.join(root, ".state", "secret.txt"), "needle");
  const outside = path.join(temp, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret-outside.txt"), "needle");
  await fs.symlink(outside, path.join(root, "external"));
  await fs.symlink(
    path.join(outside, "secret-outside.txt"),
    path.join(root, "alias.txt"),
  );
  await fs.mkdir(path.join(root, "hidden-target"));
  await fs.writeFile(
    path.join(root, "hidden-target", "secret-inside.txt"),
    "needle",
  );
  await fs.symlink(
    path.join(root, "hidden-target"),
    path.join(root, "alias-folder"),
  );
  await fs.writeFile(
    path.join(root, "binary.txt"),
    Buffer.from("needle\0binary"),
  );
  const names = await search("secret", { recursive: true, hidden: true });
  assert.deepEqual(
    names.results.map((r) => r.relativePath),
    ["hidden-target/secret-inside.txt"],
  );
  const contents = await search("needle", {
    mode: "contents",
    recursive: true,
    hidden: true,
  });
  assert.deepEqual(
    contents.results.map((r) => r.relativePath),
    ["hidden-target/secret-inside.txt"],
  );
  assert.ok(contents.skipped >= 1);
  await assert.rejects(search("needle", { path: outside }), /outside/);
  await assert.rejects(
    search("needle", { path: path.join(root, ".state") }),
    /internal/,
  );
});

test("Find contents reports line numbers, caps matching lines, and reports truncated files", async (t) => {
  const { root, search } = await fixture(t);
  await fs.writeFile(
    path.join(root, "README"),
    "intro\r\nNeedle here\r\nno match\r\nNEEDLE again",
  );
  let result = await search("needle", { mode: "contents" });
  assert.deepEqual(
    result.results.map((r) => [r.line, r.snippet]),
    [
      [2, "Needle here"],
      [4, "NEEDLE again"],
    ],
  );
  await fs.writeFile(path.join(root, "many.txt"), "needle\n".repeat(8));
  await fs.writeFile(
    path.join(root, "large.txt"),
    "x".repeat(256 * 1024) + "needle",
  );
  result = await search("needle", { mode: "contents" });
  assert.equal(
    result.results.filter((r) => r.file.name === "many.txt").length,
    5,
  );
  assert.equal(
    result.results.some((r) => r.file.name === "large.txt"),
    false,
  );
  assert.equal(result.limited, true);
  assert.equal(result.skipped, 1);
});

test("Find rejects invalid queries, honors cancellation, and caps results at 250", async (t) => {
  const { root, search } = await fixture(t);
  await assert.rejects(search(" "), /between 1 and 200/);
  await assert.rejects(search("a".repeat(201)), /between 1 and 200/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(search("item", {}, controller.signal), {
    name: "AbortError",
  });
  await Promise.all(
    Array.from({ length: 251 }, (_, i) =>
      fs.writeFile(path.join(root, `item-${i}.txt`), ""),
    ),
  );
  const result = await search("item");
  assert.equal(result.results.length, 250);
  assert.equal(result.limited, true);
});
