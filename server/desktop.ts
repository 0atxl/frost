import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Device, OperationResult, TrashEntry } from "../shared/types.js";
import { FileSystem, FileError } from "./filesystem.js";

export function desktop<T>(
  command: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "/usr/bin/python3",
      [fileURLToPath(new URL("./desktop.py", import.meta.url))],
      { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        try {
          const response = JSON.parse(stdout);
          if (response.error) reject(new FileError(response.error));
          else if (error)
            reject(new FileError("The desktop operation did not finish."));
          else resolve(response.result);
        } catch {
          reject(
            new FileError(
              "Desktop integration is unavailable. Frost needs Python GObject and GVfs in your desktop session.",
            ),
          );
        }
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(JSON.stringify({ command, ...data }));
  });
}

export class DesktopFiles {
  constructor(private files: FileSystem) {}
  async devices() {
    const devices = await desktop<Device[]>("devices");
    return devices.filter(
      (device) =>
        !device.path ||
        (() => {
          try {
            this.files.expand(device.path);
            return true;
          } catch {
            return false;
          }
        })(),
    );
  }
  async listTrash() {
    const [system, legacy] = await Promise.all([
      desktop<TrashEntry[]>("list-trash"),
      this.files.listTrash(),
    ]);
    return [
      ...system.filter((item) => {
        try {
          this.files.expand(item.originalPath);
          return true;
        } catch {
          return false;
        }
      }),
      ...legacy.map((item) => ({ ...item, source: "legacy" as const })),
    ].sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
  }
  async trash(paths: string[]): Promise<OperationResult> {
    return this.files.exclusive(async () => {
      const result: OperationResult = {
        completed: [],
        errors: [],
        trashIds: [],
      };
      for (const input of paths) {
        try {
          const source = await this.files.mutationPath(input);
          const id = await desktop<string | null>("trash", { path: source });
          result.completed.push(input);
          if (id) result.trashIds!.push(id);
        } catch (error) {
          result.errors.push({
            path: input,
            message: (error as Error).message,
          });
        }
      }
      return result;
    });
  }
  async restore(id: string) {
    if (!id.startsWith("system:")) return this.files.restore(id);
    return this.files.exclusive(async () => {
      const item = (await this.listTrash()).find((item) => item.id === id);
      if (!item) throw new FileError("This item is no longer in Trash.");
      const destination = await this.files.restoreDestination(
        item.originalPath,
      );
      await desktop("restore", { id, destination });
      return this.files.entry(destination);
    });
  }
  async deleteTrash(ids: string[]): Promise<OperationResult> {
    const result: OperationResult = { completed: [], errors: [] };
    // Validate against the visible snapshot before allowing any destructive call.
    const known = new Set((await this.listTrash()).map((item) => item.id));
    for (const id of ids) {
      try {
        if (!known.has(id))
          throw new FileError("This item is no longer in Trash.");
        if (id.startsWith("system:"))
          await this.files.exclusive(() => desktop("delete-trash", { id }));
        else {
          const legacy = await this.files.deleteTrash([id]);
          if (legacy.errors.length)
            throw new FileError(legacy.errors[0].message);
        }
        result.completed.push(id);
      } catch (error) {
        result.errors.push({ path: id, message: (error as Error).message });
      }
    }
    return result;
  }
}
