import * as fs from "node:fs/promises";
import path from "node:path";
import { FileSystem, FileError, classify } from "./filesystem.js";
import type { FindResponse, FindResult } from "../shared/types.js";

// Subsequence matching with a preference for exact, contiguous and word-start matches.
function scoreName(name: string, query: string): number | null {
  const text = name.toLocaleLowerCase();
  if (text === query) return 100_000;
  const exact = text.indexOf(query);
  if (exact >= 0) return 10_000 - exact * 10 - text.length;
  let position = -1,
    score = 0;
  for (const character of query) {
    const next = text.indexOf(character, position + 1);
    if (next < 0) return null;
    score += next === position + 1 ? 15 : 0;
    score += next === 0 || /[\s_.\-/]/.test(text[next - 1]) ? 20 : 0;
    score -= next - position - 1;
    position = next;
  }
  return score - text.length / 100;
}

export async function findFiles(
  files: FileSystem,
  input: {
    path: string;
    query: string;
    mode: "names" | "contents";
    recursive: boolean;
    hidden: boolean;
  },
  signal: AbortSignal,
): Promise<FindResponse> {
  const query = input.query.trim().toLocaleLowerCase();
  if (!query || query.length > 200)
    throw new FileError("Enter between 1 and 200 characters.");
  const root = await files.resolve(input.path);
  if (!(await fs.stat(root)).isDirectory())
    throw new FileError("Choose a folder to search.");
  const unsafe = (value: string) =>
    ["/proc", "/sys", "/dev"].some(
      (prefix) => value === prefix || value.startsWith(prefix + "/"),
    );
  if (unsafe(root))
    throw new FileError("Search is unavailable in system interfaces.");
  const response: FindResponse = {
    results: [],
    scanned: 0,
    skipped: 0,
    limited: false,
  };
  const ranked: { result: FindResult; score: number }[] = [];
  const pending = [root];
  const deadline = Date.now() + 10_000;
  const stopped = () => {
    signal.throwIfAborted();
    if (Date.now() >= deadline || response.scanned >= 10_000) {
      response.limited = true;
      return true;
    }
    return false;
  };
  function add(result: FindResult, score: number) {
    ranked.push({ result, score });
    ranked.sort(
      (a, b) =>
        b.score - a.score ||
        a.result.relativePath.localeCompare(b.result.relativePath) ||
        (a.result.line ?? 0) - (b.result.line ?? 0),
    );
    if (ranked.length > 250) {
      ranked.pop();
      response.limited = true;
    }
  }
  while (pending.length && !stopped()) {
    const folder = pending.pop()!;
    try {
      const directory = await fs.opendir(folder);
      for await (const child of directory) {
        if (stopped()) break;
        if (!input.hidden && child.name.startsWith(".")) continue;
        const location = path.join(folder, child.name);
        if (unsafe(location)) continue;
        response.scanned++;
        try {
          files.expand(location); // Also excludes Frost's private data directory.
          if (child.isDirectory() && input.recursive) pending.push(location);
          const relativePath = path.relative(root, location);
          if (input.mode === "names") {
            const score = scoreName(child.name, query);
            if (score !== null)
              add({ file: await files.entry(location), relativePath }, score);
          } else if (child.isFile()) {
            const kind = classify(child.name, false).kind;
            if (!["text", "code", "unknown"].includes(kind)) continue;
            const text = await files.text(location);
            if (stopped()) break;
            if (text.binary) continue;
            if (text.truncated) response.skipped++;
            let entry: Awaited<ReturnType<FileSystem["entry"]>> | undefined;
            const lines = text.text.split(/\r?\n/);
            for (let index = 0, matches = 0; index < lines.length; index++) {
              // An incomplete final line is still useful as a preview match.
              const offset = lines[index].toLocaleLowerCase().indexOf(query);
              if (offset < 0) continue;
              if (matches++ >= 5) {
                response.limited = true;
                break;
              }
              entry ??= await files.entry(location);
              const start = Math.max(0, offset - 60);
              add(
                {
                  file: entry,
                  relativePath,
                  line: index + 1,
                  snippet:
                    (start ? "…" : "") +
                    lines[index].slice(start, start + 240).trim() +
                    (lines[index].length > start + 240 ? "…" : ""),
                },
                0,
              );
            }
          }
        } catch (error) {
          signal.throwIfAborted();
          response.skipped++;
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      if (folder === root) throw error;
      response.skipped++;
    }
  }
  response.results = ranked.map((item) => item.result);
  return response;
}
