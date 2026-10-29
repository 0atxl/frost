import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import * as fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { timingSafeEqual } from "node:crypto";
import mime from "mime-types";
import { FileSystem, FileError, errorMessage } from "./filesystem.js";
import { AppLock } from "./auth.js";
import { Thumbnails } from "./thumbnails.js";
import { DesktopFiles, desktop } from "./desktop.js";
import { findFiles } from "./find.js";
import type { Session } from "../shared/types.js";

export interface AppOptions {
  root: string;
  dataDir: string;
  initialPath: string;
  distDir?: string;
  allowedPorts?: number[];
}
const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new FileError("Use application/json for file operations.", 415);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024)
      throw new FileError("Too many items in one request.", 413);
    chunks.push(Buffer.from(chunk));
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new FileError("Invalid request.");
  }
}
function string(value: unknown): string {
  if (typeof value !== "string")
    throw new FileError("Missing file path or name.");
  return value;
}
function paths(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 500 ||
    value.some((v) => typeof v !== "string")
  )
    throw new FileError("Select between 1 and 500 items.");
  return [...new Set(value)] as string[];
}
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function byteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0)
    throw new FileError("This byte range is unavailable.", 416);
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= size ||
    end < start
  )
    throw new FileError("This byte range is unavailable.", 416);
  return { start, end };
}

export async function createApp(options: AppOptions) {
  const files = new FileSystem(options.root, options.dataDir);
  await files.initialize();
  const thumbnails = new Thumbnails();
  const lock = new AppLock(files.dataDir, () => thumbnails.clear());
  await lock.initialize();
  const desktopFiles = new DesktopFiles(files);
  let searchJobs = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    try {
      const host = req.headers.host || "";
      const hostMatch = /^(127\.0\.0\.1|localhost)(?::(\d+))?$/.exec(host);
      if (!hostMatch)
        throw new FileError("Frost only accepts local connections.", 403);
      const localPort = (server.address() as { port: number } | null)?.port;
      const allowedPorts = new Set([
        localPort,
        ...(options.allowedPorts || []),
      ]);
      if (!allowedPorts.has(Number(hostMatch[2] || 80)))
        throw new FileError("Unexpected local port.", 403);
      const origin = req.headers.origin;
      if (origin) {
        const parsed = new URL(origin);
        if (
          !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
          parsed.protocol !== "http:" ||
          !allowedPorts.has(Number(parsed.port || 80))
        )
          throw new FileError(
            "Requests from other websites are not allowed.",
            403,
          );
      }
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new FileError(
          "Requests from other websites are not allowed.",
          403,
        );
      const url = new URL(req.url || "/", `http://${host}`);
      const cookie =
        req.headers.cookie
          ?.split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("frost_session="))
          ?.slice(14) || "";
      if (url.pathname === "/api/auth/status" && req.method === "GET") {
        json(res, lock.status(cookie));
        return;
      }
      if (url.pathname === "/api/auth/unlock" && req.method === "POST") {
        const data = await body(req);
        const id = await lock.unlock(string(data.key), data.setup === true);
        res.setHeader(
          "Set-Cookie",
          `frost_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
        );
        json(res, lock.status(id));
        return;
      }
      const access = lock.get(cookie);
      if (url.pathname.startsWith("/api/")) {
        if (!access)
          throw new FileError("Frost is locked. Enter your access key.", 401);
        if (
          req.method !== "GET" &&
          req.method !== "HEAD" &&
          !equal(String(req.headers["x-frost-token"] || ""), access.token)
        )
          throw new FileError("Refresh before changing files.", 403);
      }
      if (url.pathname === "/api/session" && req.method === "GET") {
        const initialPath = await files
          .resolve(options.initialPath)
          .catch(() => files.root);
        const candidates = [
          ["Home", os.homedir()],
          ["Downloads", path.join(os.homedir(), "Downloads")],
          ["Documents", path.join(os.homedir(), "Documents")],
          ["Pictures", path.join(os.homedir(), "Pictures")],
          ["Projects", path.join(os.homedir(), "projects")],
        ];
        const places = [];
        for (const [name, candidate] of candidates) {
          try {
            const p = await files.resolve(candidate);
            if ((await fs.stat(p)).isDirectory())
              places.push({ name, path: p });
          } catch {
            /* Only show available places. */
          }
        }
        if (!places.some((place) => place.path === files.root))
          places.unshift({
            name: path.basename(files.root) || "Filesystem",
            path: files.root,
          });
        const session: Session = {
          token: access!.token,
          home: os.homedir(),
          root: files.root,
          initialPath,
          places,
        };
        json(res, session);
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        if (req.method === "GET" && url.pathname === "/api/devices") {
          json(res, await desktopFiles.devices());
          return;
        }
        const input = url.searchParams.get("path") || files.root;
        if (req.method === "GET" && url.pathname === "/api/find") {
          if (searchJobs >= 3)
            throw new FileError(
              "Another search is finishing. Try again in a moment.",
              429,
            );
          const mode = url.searchParams.get("mode");
          if (mode !== "names" && mode !== "contents")
            throw new FileError("Choose Names or Contents.");
          const controller = new AbortController();
          const stop = () => controller.abort();
          res.on("close", stop);
          lock.streams.set(stop, cookie);
          searchJobs++;
          try {
            const result = await findFiles(
              files,
              {
                path: input,
                query: url.searchParams.get("query") || "",
                mode,
                recursive: url.searchParams.get("recursive") === "1",
                hidden: url.searchParams.get("hidden") === "1",
              },
              controller.signal,
            );
            if (!lock.get(cookie)) throw new FileError("Frost is locked.", 401);
            if (!res.destroyed) json(res, result);
          } finally {
            searchJobs--;
            lock.streams.delete(stop);
            res.off("close", stop);
          }
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/applications") {
          const file = await files.regularFile(input);
          const applications = await desktop("applications", { path: file });
          if (!lock.get(cookie)) throw new FileError("Frost is locked.", 401);
          json(res, applications);
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/list") {
          const listing = await files.list(
            input,
            url.searchParams.get("hidden") === "1",
          );
          if (!lock.get(cookie)) throw new FileError("Frost is locked.", 401);
          json(res, listing);
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/text") {
          const text = await files.text(input);
          if (!lock.get(cookie)) throw new FileError("Frost is locked.", 401);
          json(res, text);
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/trash") {
          json(res, await desktopFiles.listTrash());
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/thumbnail") {
          const file = await files.regularFile(input);
          const entry = await files.entry(file);
          if (entry.kind !== "image" || entry.extension === "svg")
            throw new FileError("No generated thumbnail for this file.", 415);
          try {
            if (!lock.get(cookie)) throw new FileError("Frost is locked.", 401);
            const bytes = await thumbnails.get(file);
            if (!lock.get(cookie)) throw new FileError("Frost is locked.", 401);
            res.writeHead(200, {
              "Content-Type": "image/webp",
              "Content-Length": bytes.length,
              "Cache-Control": "no-store",
            });
            res.end(bytes);
          } catch (error) {
            throw error instanceof FileError
              ? error
              : new FileError("This image could not be decoded.", 415);
          }
          return;
        }
        if (
          (req.method === "GET" || req.method === "HEAD") &&
          url.pathname === "/api/file"
        ) {
          const file = await files.regularFile(input);
          const handle = await fs.open(
            file,
            fs.constants.O_RDONLY | fs.constants.O_NONBLOCK,
          );
          try {
            if (!lock.get(cookie)) throw new FileError("Frost is locked.", 401);
            const stat = await handle.stat();
            if (!stat.isFile())
              throw new FileError("Only regular files can be opened.");
            const type = mime.lookup(file) || "application/octet-stream";
            const inline =
              /^(image\/|audio\/|video\/|application\/pdf$)/.test(type) &&
              url.searchParams.get("download") !== "1";
            const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(path.basename(file)).replace(/'/g, "%27")}`;
            res.setHeader(
              "Content-Type",
              inline ? type : "application/octet-stream",
            );
            res.setHeader("Content-Disposition", disposition);
            res.setHeader(
              "Content-Security-Policy",
              "sandbox; default-src 'none'; style-src 'unsafe-inline'",
            );
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Accept-Ranges", "bytes");
            let range;
            try {
              range = byteRange(req.headers.range, stat.size);
            } catch (error) {
              res.setHeader("Content-Range", `bytes */${stat.size}`);
              throw error;
            }
            const start = range?.start ?? 0,
              end = range?.end ?? stat.size - 1;
            if (range)
              res.setHeader(
                "Content-Range",
                `bytes ${start}-${end}/${stat.size}`,
              );
            res.setHeader(
              "Content-Length",
              range ? end - start + 1 : stat.size,
            );
            res.statusCode = range ? 206 : 200;
            if (req.method === "HEAD" || stat.size === 0) {
              await handle.close();
              res.end();
              return;
            }
            const stream = handle.createReadStream({
              start,
              end,
              autoClose: true,
            });
            const stop = () => {
              stream.destroy();
              res.destroy();
            };
            lock.streams.set(stop, cookie);
            stream.on("close", () => lock.streams.delete(stop));
            stream.on("error", () => res.destroy());
            res.on("close", () => stream.destroy());
            stream.pipe(res);
          } catch (error) {
            await handle.close();
            throw error;
          }
          return;
        }
        if (req.method === "POST") {
          const data = await body(req);
          if (url.pathname === "/api/auth/lock") {
            lock.lock();
            res.setHeader(
              "Set-Cookie",
              "frost_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
            );
            json(res, { ok: true });
            return;
          }
          if (url.pathname === "/api/auth/activity") {
            lock.touch(cookie);
            json(res, { ok: true });
            return;
          }
          if (url.pathname === "/api/auth/settings") {
            await lock.setIdle(Number(data.idleMinutes));
            json(res, lock.status(cookie));
            return;
          }
          if (url.pathname === "/api/auth/key") {
            await lock.changeKey(string(data.currentKey), string(data.newKey));
            res.setHeader(
              "Set-Cookie",
              "frost_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
            );
            json(res, { ok: true });
            return;
          }
          if (url.pathname === "/api/open") {
            const file = await files.regularFile(string(data.path));
            await desktop("open", {
              path: file,
              ...(data.application
                ? { application: string(data.application) }
                : {}),
            });
            json(res, { ok: true });
            return;
          }
          if (url.pathname === "/api/folders") {
            json(
              res,
              await files.mkdir(string(data.parent), string(data.name)),
              201,
            );
            return;
          }
          if (url.pathname === "/api/rename") {
            json(res, await files.rename(string(data.path), string(data.name)));
            return;
          }
          if (url.pathname === "/api/transfer") {
            if (data.mode !== "copy" && data.mode !== "move")
              throw new FileError("Choose copy or move.");
            json(
              res,
              await files.transfer(
                paths(data.paths),
                string(data.destination),
                data.mode,
              ),
            );
            return;
          }
          if (url.pathname === "/api/trash") {
            json(res, await desktopFiles.trash(paths(data.paths)));
            return;
          }
          if (url.pathname === "/api/restore") {
            json(res, await desktopFiles.restore(string(data.id)));
            return;
          }
          if (url.pathname === "/api/trash/delete") {
            json(res, await desktopFiles.deleteTrash(paths(data.ids)));
            return;
          }
        }
        throw new FileError("This action is not available.", 404);
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new FileError("Method not allowed.", 405);
      if (!options.distDir)
        throw new FileError("Open the frontend at http://127.0.0.1:4317.", 404);
      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (!relative || !path.extname(relative)) relative = "index.html";
      const asset = path.resolve(options.distDir, relative);
      if (!asset.startsWith(path.resolve(options.distDir) + path.sep))
        throw new FileError("Not found.", 404);
      const stat = await fs.stat(asset);
      if (!stat.isFile()) throw new FileError("Not found.", 404);
      res.setHeader(
        "Content-Type",
        mime.contentType(path.extname(asset)) || "application/octet-stream",
      );
      res.setHeader("Content-Length", stat.size);
      res.setHeader(
        "Cache-Control",
        relative.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = createReadStream(asset);
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.removeHeader("Content-Length");
      const status =
        error instanceof FileError
          ? error.status
          : (error as NodeJS.ErrnoException).code === "ENOENT"
            ? 404
            : ["EPERM", "EACCES"].includes(
                  (error as NodeJS.ErrnoException).code || "",
                )
              ? 403
              : 500;
      json(res, { error: errorMessage(error) }, status);
    }
  });
  server.requestTimeout = 30_000;
  const lockTimer = setInterval(() => lock.prune(), 1000);
  lockTimer.unref();
  server.on("close", () => {
    clearInterval(lockTimer);
    lock.lock();
  });
  return { server, files };
}
