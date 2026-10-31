import path from "node:path";
import os from "node:os";
import { mkdir, stat } from "node:fs/promises";

// Reuse legacy state in place. Never copy, merge, reset, or remove it.
export async function resolveDataDir(
  installation: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  home = os.homedir(),
): Promise<string> {
  if (env.FROST_DATA_DIR) return path.resolve(cwd, env.FROST_DATA_DIR);
  for (const directory of new Set([
    path.join(cwd, ".frost-data"),
    path.join(installation, ".frost-data"),
  ])) {
    try {
      if (!(await stat(directory)).isDirectory()) {
        throw new Error(`Frost data path is not a directory: ${directory}`);
      }
      return directory;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const base = env.XDG_DATA_HOME || path.join(home, ".local", "share");
  if (!path.isAbsolute(base)) throw new Error("XDG_DATA_HOME must be an absolute path.");
  const directory = path.join(base, "frost");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}
