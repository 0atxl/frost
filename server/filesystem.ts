import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import mime from "mime-types";
import type {
  FileEntry,
  FileKind,
  DirectoryListing,
  OperationResult,
  TextPreview,
  TrashEntry,
} from "../shared/types.js";

export class FileError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof FileError) return error.message;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "EACCES" || code === "EPERM")
    return "You do not have permission to access this item.";
  if (code === "ENOENT") return "This file or folder no longer exists.";
  if (code === "ENOTDIR") return "This path is not a folder.";
  if (code === "EEXIST" || code === "ENOTEMPTY")
    return "An item with that name already exists. Choose another name.";
  if (code === "EXDEV")
    return "Moving between filesystems is not supported yet. Copy the item to the destination instead.";
  return error instanceof Error
    ? error.message
    : "The operation could not be completed.";
}
const codeExtensions = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "json",
  "jsonc",
  "css",
  "scss",
  "sass",
  "html",
  "htm",
  "xml",
  "yaml",
  "yml",
  "toml",
  "py",
  "rs",
  "go",
  "c",
  "h",
  "cpp",
  "hpp",
  "java",
  "kt",
  "sh",
  "bash",
  "zsh",
  "fish",
  "sql",
  "rb",
  "php",
  "vue",
  "svelte",
  "ini",
  "conf",
  "env",
  "csv",
  "tsv",
  "log",
  "lock",
]);
const textExtensions = new Set([
  "txt",
  "md",
  "mdx",
  "markdown",
  "rst",
  "tex",
  "gitignore",
  "gitattributes",
  "editorconfig",
]);
const archiveExtensions = new Set([
  "zip",
  "tar",
  "gz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "tgz",
  "zst",
]);
export function classify(
  name: string,
  isDirectory: boolean,
): { kind: FileKind; mime: string; extension: string } {
  const extension = path.extname(name).slice(1).toLowerCase();
  const media = mime.lookup(name) || "application/octet-stream";
  let kind: FileKind = "unknown";
  if (isDirectory) kind = "folder";
  else if (
    codeExtensions.has(extension) ||
    /^\.(env|bashrc|zshrc)$/.test(name) ||
    name === "Dockerfile"
  )
    kind = "code";
  else if (media.startsWith("image/")) kind = "image";
  else if (media.startsWith("video/")) kind = "video";
  else if (media.startsWith("audio/")) kind = "audio";
  else if (extension === "pdf") kind = "pdf";
  else if (
    textExtensions.has(extension) ||
    media.startsWith("text/") ||
    /^(README|LICENSE|NOTICE|CHANGELOG)(\.|$)/i.test(name)
  )
    kind = "text";
  else if (archiveExtensions.has(extension)) kind = "archive";
  return { kind, mime: isDirectory ? "inode/directory" : media, extension };
}
function within(parent: string, child: string) {
  const rel = path.relative(parent, child);
  return (
    rel === "" ||
    (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))
  );
}
async function exists(p: string) {
  try {
    await fs.lstat(p);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    }),
  );
  return results;
}

let mountCache: { at: number; mounts: { path: string; ro: boolean }[] } = {
  at: 0,
  mounts: [],
};
async function isReadOnlyMount(input: string) {
  if (Date.now() - mountCache.at > 3000) {
    const source = await fs.readFile("/proc/self/mountinfo", "utf8");
    mountCache = {
      at: Date.now(),
      mounts: source
        .trim()
        .split("\n")
        .map((line) => {
          const fields = line.split(" ");
          return {
            path: fields[4].replace(/\\([0-7]{3})/g, (_, octal) =>
              String.fromCharCode(parseInt(octal, 8)),
            ),
            ro: fields[5].split(",").includes("ro"),
          };
        })
        .sort((a, b) => b.path.length - a.path.length),
    };
  }
  return (
    mountCache.mounts.find((mount) => within(mount.path, input))?.ro ?? false
  );
}

export class FileSystem {
  readonly root: string;
  readonly dataDir: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(root: string, dataDir: string) {
    this.root = path.resolve(root);
    this.dataDir = path.resolve(dataDir);
  }

  async initialize() {
    const realRoot = await fs.realpath(this.root);
    if (realRoot !== this.root)
      throw new FileError("FROST_ROOT must be a canonical directory path.");
    if (!(await fs.stat(this.root)).isDirectory())
      throw new FileError("FROST_ROOT must be a directory.");
    if (within(this.dataDir, this.root))
      throw new FileError(
        "The data directory cannot contain the filesystem root.",
      );
    await fs.mkdir(path.join(this.dataDir, "trash"), {
      recursive: true,
      mode: 0o700,
    });
    const realDataDir = await fs.realpath(this.dataDir);
    if (realDataDir !== this.dataDir)
      throw new FileError("FROST_DATA_DIR must not contain symbolic links.");
  }

  private check(p: string) {
    if (!within(this.root, p))
      throw new FileError(
        `This path is outside Frost's configured root (${this.root}). Change FROST_ROOT and restart Frost to access it.`,
        403,
      );
    if (within(this.dataDir, p))
      throw new FileError(
        "Frost keeps its internal files separate. Open Trash from the sidebar.",
        403,
      );
  }
  expand(input: string) {
    if (typeof input !== "string" || !input || input.includes("\0"))
      throw new FileError("Enter a valid folder or file path.");
    const expanded =
      input === "~"
        ? os.homedir()
        : input.startsWith("~/")
          ? path.join(os.homedir(), input.slice(2))
          : input;
    const absolute = path.resolve(this.root, expanded);
    this.check(absolute);
    return absolute;
  }
  async resolve(input: string) {
    const absolute = this.expand(input);
    const real = await fs.realpath(absolute);
    this.check(real);
    return real;
  }
  async mutationPath(input: string) {
    const absolute = this.expand(input);
    const parent = await this.resolve(path.dirname(absolute));
    const entry = path.join(parent, path.basename(absolute));
    this.check(entry);
    if (entry === this.root || within(entry, this.dataDir))
      throw new FileError(
        "This folder contains Frost or its data and cannot be moved.",
        403,
      );
    await this.resolve(entry);
    return entry;
  }
  private validName(name: string) {
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name === "." ||
      name === ".." ||
      /[\/\\\0]/.test(name)
    )
      throw new FileError("Enter a name without slashes.");
    if (Buffer.byteLength(name) > 255)
      throw new FileError("This name is too long.");
    return name;
  }
  private async destination(parent: string, name: string) {
    const dir = await this.resolve(parent);
    if (!(await fs.stat(dir)).isDirectory())
      throw new FileError("Choose a destination folder.");
    const target = path.join(dir, this.validName(name));
    this.check(target);
    if (await exists(target))
      throw new FileError(
        `“${name}” already exists. Choose another name.`,
        409,
      );
    return target;
  }
  async restoreDestination(original: string) {
    return this.destination(path.dirname(original), path.basename(original));
  }
  async writable(input: string) {
    try {
      await fs.access(input, fs.constants.W_OK);
      return !(await isReadOnlyMount(input));
    } catch {
      return false;
    }
  }
  async regularFile(input: string) {
    const file = await this.resolve(input);
    if (["/proc", "/sys", "/dev"].some((prefix) => within(prefix, file)))
      throw new FileError(
        "System interfaces cannot be previewed or opened from Frost.",
        403,
      );
    if (!(await fs.stat(file)).isFile())
      throw new FileError("Only regular files can be opened.");
    return file;
  }
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    this.queue = result.catch(() => undefined);
    return result;
  }
  async entry(input: string): Promise<FileEntry> {
    const absolute = this.expand(input);
    const lstat = await fs.lstat(absolute);
    let stat = lstat,
      accessible = true;
    try {
      const resolved = await this.resolve(absolute);
      stat = await fs.stat(resolved);
    } catch {
      accessible = false;
    }
    if (!stat.isFile() && !stat.isDirectory() && !lstat.isSymbolicLink())
      accessible = false;
    return {
      name: path.basename(absolute),
      path: absolute,
      ...classify(path.basename(absolute), stat.isDirectory()),
      size: stat.isDirectory() ? 0 : stat.size,
      modified: stat.mtime.toISOString(),
      created: stat.birthtime.toISOString(),
      isSymlink: lstat.isSymbolicLink(),
      accessible,
      writable: accessible && (await this.writable(path.dirname(absolute))),
    };
  }
  async list(input: string, hidden = false): Promise<DirectoryListing> {
    const dir = await this.resolve(input);
    const children = await fs.readdir(dir, { withFileTypes: true });
    const visible = children.filter(
      (child) => !within(this.dataDir, path.join(dir, child.name)),
    );
    const hiddenCount = visible.filter((child) =>
      child.name.startsWith("."),
    ).length;
    const entries = await mapLimit(
      visible.filter((child) => hidden || !child.name.startsWith(".")),
      24,
      async (child) => {
        try {
          return await this.entry(path.join(dir, child.name));
        } catch {
          return null;
        }
      },
    );
    return {
      path: dir,
      parent: dir === this.root ? null : path.dirname(dir),
      entries: entries.filter((e): e is FileEntry => e !== null),
      hiddenCount,
      readOnly: !(await this.writable(dir)),
    };
  }
  async text(input: string): Promise<TextPreview> {
    const file = await this.regularFile(input);
    const handle = await fs.open(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile())
        throw new FileError("This item cannot be previewed as text.");
      const limit = 256 * 1024;
      const buffer = Buffer.alloc(Math.min(stat.size, limit));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const bytes = buffer.subarray(0, bytesRead);
      const binary =
        bytes.includes(0) ||
        (bytes.length > 0 &&
          bytes.filter((b) => b < 9 || (b > 13 && b < 32)).length /
            bytes.length >
            0.02);
      return {
        text: binary ? "" : bytes.toString("utf8"),
        truncated: stat.size > bytesRead,
        binary,
      };
    } finally {
      await handle.close();
    }
  }
  async mkdir(parent: string, name: string) {
    return this.exclusive(async () => {
      const dest = await this.destination(parent, name);
      await fs.mkdir(dest);
      return this.entry(dest);
    });
  }
  async rename(input: string, name: string) {
    return this.exclusive(async () => {
      const source = await this.mutationPath(input);
      if (name === path.basename(source)) return this.entry(source);
      const target = await this.destination(path.dirname(source), name);
      await fs.rename(source, target);
      return this.entry(target);
    });
  }
  async transfer(
    paths: string[],
    parent: string,
    mode: "copy" | "move",
  ): Promise<OperationResult> {
    return this.exclusive(async () => {
      const result: OperationResult = { completed: [], errors: [] };
      for (const input of paths) {
        try {
          const source =
            mode === "move"
              ? await this.mutationPath(input)
              : this.expand(input);
          const realSource = await this.resolve(source);
          const dest = await this.destination(parent, path.basename(source));
          if (within(realSource, dest))
            throw new FileError(
              "A folder cannot be copied or moved into itself.",
            );
          if (within(realSource, this.dataDir))
            throw new FileError(
              "This folder contains Frost’s internal data. Choose a subfolder.",
            );
          if (mode === "copy")
            await fs.cp(source, dest, {
              recursive: true,
              force: false,
              errorOnExist: true,
              dereference: false,
              verbatimSymlinks: true,
            });
          else await fs.rename(source, dest);
          result.completed.push(input);
        } catch (error) {
          result.errors.push({ path: input, message: errorMessage(error) });
        }
      }
      return result;
    });
  }
  async trash(paths: string[]): Promise<OperationResult> {
    return this.exclusive(async () => {
      const result: OperationResult = {
        completed: [],
        errors: [],
        trashIds: [],
      };
      for (const input of paths) {
        let bucket: string | undefined;
        try {
          const source = await this.mutationPath(input);
          const id = randomUUID();
          bucket = path.join(this.dataDir, "trash", id);
          await fs.mkdir(bucket, { mode: 0o700 });
          const manifest: TrashEntry = {
            id,
            name: path.basename(source),
            originalPath: source,
            trashedAt: new Date().toISOString(),
          };
          await fs.writeFile(
            path.join(bucket, "info.json"),
            JSON.stringify(manifest),
            { mode: 0o600, flag: "wx" },
          );
          await fs.rename(source, path.join(bucket, "content"));
          result.completed.push(input);
          result.trashIds!.push(id);
        } catch (error) {
          // Never clean up a bucket if it already contains the user's file.
          if (bucket && !(await exists(path.join(bucket, "content"))))
            await fs.rm(bucket, { recursive: true, force: true });
          result.errors.push({ path: input, message: errorMessage(error) });
        }
      }
      return result;
    });
  }
  async listTrash(): Promise<TrashEntry[]> {
    const ids = await fs.readdir(path.join(this.dataDir, "trash"));
    const items = await mapLimit(ids, 12, async (id) => {
      try {
        if (!/^[a-f0-9-]{36}$/.test(id)) return null;
        const bucket = path.join(this.dataDir, "trash", id);
        if (!(await exists(path.join(bucket, "content")))) return null;
        const info = JSON.parse(
          await fs.readFile(path.join(bucket, "info.json"), "utf8"),
        ) as TrashEntry;
        return { ...info, id };
      } catch {
        return null;
      }
    });
    return items
      .filter((item): item is TrashEntry => item !== null)
      .sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
  }
  async restore(id: string) {
    return this.exclusive(async () => {
      if (!/^[a-f0-9-]{36}$/.test(id))
        throw new FileError("Invalid trash item.");
      const bucket = path.join(this.dataDir, "trash", id);
      const info = JSON.parse(
        await fs.readFile(path.join(bucket, "info.json"), "utf8"),
      ) as TrashEntry;
      const dest = await this.destination(
        path.dirname(info.originalPath),
        path.basename(info.originalPath),
      );
      await fs.rename(path.join(bucket, "content"), dest);
      await fs.rm(bucket, { recursive: true, force: true });
      return this.entry(dest);
    });
  }

  async deleteTrash(ids: string[]): Promise<OperationResult> {
    return this.exclusive(async () => {
      const result: OperationResult = { completed: [], errors: [] };
      for (const id of new Set(ids)) {
        try {
          if (!/^[a-f0-9-]{36}$/.test(id))
            throw new FileError("Invalid trash item.");
          const bucket = path.join(this.dataDir, "trash", id);
          const stat = await fs.lstat(bucket);
          if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new FileError("Invalid trash item.");
          await fs.rm(bucket, { recursive: true });
          result.completed.push(id);
        } catch (error) {
          result.errors.push({ path: id, message: errorMessage(error) });
        }
      }
      return result;
    });
  }
}
