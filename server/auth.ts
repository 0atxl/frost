import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { FileError } from "./filesystem.js";

const derive = promisify(scrypt);
type Credentials = { salt: string; hash: string; idleMinutes: number };
type AccessSession = { token: string; activity: number; expires: number };

export class AppLock {
  private credentials: Credentials | null = null;
  private sessions = new Map<string, AccessSession>();
  private attempts = 0;
  private nextAttempt = 0;
  private checking = false;
  private file: string;
  readonly streams = new Map<() => void, string>();

  constructor(
    dataDir: string,
    private onLocked: () => void = () => {},
  ) {
    this.file = path.join(dataDir, "access.json");
  }
  async initialize() {
    try {
      this.credentials = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  status(id: string) {
    return {
      setupRequired: !this.credentials,
      unlocked: !!this.get(id),
      idleMinutes: this.credentials?.idleMinutes ?? 0,
    };
  }
  get(id: string) {
    const session = this.sessions.get(id);
    if (!session) return null;
    const idle = (this.credentials?.idleMinutes ?? 0) * 60_000;
    if (
      Date.now() >= session.expires ||
      (idle > 0 && Date.now() - session.activity >= idle)
    ) {
      this.revoke(id);
      return null;
    }
    return session;
  }
  private revoke(id: string) {
    this.sessions.delete(id);
    for (const [stop, owner] of this.streams) if (owner === id) stop();
    if (!this.sessions.size) this.onLocked();
  }
  prune() {
    for (const id of this.sessions.keys()) this.get(id);
  }
  async unlock(key: string, setup: boolean) {
    if (this.checking || Date.now() < this.nextAttempt)
      throw new FileError("Please wait before trying again.", 429);
    if (typeof key !== "string" || key.length > 1024 || key.length < 1)
      throw new FileError("Enter your access key.");
    this.checking = true;
    try {
      if (!this.credentials) {
        if (!setup) throw new FileError("Create an access key first.");
        if (key.length < 4) throw new FileError("Use at least 4 characters.");
        const salt = randomBytes(32).toString("hex");
        const hash = ((await derive(key, salt, 64)) as Buffer).toString("hex");
        const credentials = { salt, hash, idleMinutes: 0 };
        await fs.writeFile(this.file, JSON.stringify(credentials), {
          flag: "wx",
          mode: 0o600,
        });
        this.credentials = credentials;
      } else {
        const hash = (await derive(key, this.credentials.salt, 64)) as Buffer;
        const expected = Buffer.from(this.credentials.hash, "hex");
        if (
          expected.length !== hash.length ||
          !timingSafeEqual(hash, expected)
        ) {
          this.attempts++;
          this.nextAttempt =
            Date.now() +
            Math.min(30_000, 1000 * 2 ** Math.min(this.attempts - 1, 5));
          throw new FileError("Incorrect access key.", 401);
        }
      }
      this.attempts = 0;
      this.nextAttempt = 0;
      const id = randomBytes(32).toString("hex");
      if (this.sessions.size >= 8)
        this.revoke(this.sessions.keys().next().value!);
      this.sessions.set(id, {
        token: randomBytes(32).toString("hex"),
        activity: Date.now(),
        expires: Date.now() + 12 * 60 * 60_000,
      });
      return id;
    } finally {
      this.checking = false;
    }
  }
  touch(id: string) {
    const session = this.get(id);
    if (session) session.activity = Date.now();
  }
  async changeKey(currentKey: string, newKey: string) {
    if (!this.credentials) throw new FileError("Create an access key first.");
    if (this.checking || Date.now() < this.nextAttempt)
      throw new FileError("Please wait before trying again.", 429);
    if (currentKey.length > 1024 || newKey.length > 1024 || newKey.length < 4)
      throw new FileError("Use between 4 and 1024 characters.");
    this.checking = true;
    try {
      const hash = (await derive(
        currentKey,
        this.credentials.salt,
        64,
      )) as Buffer;
      const expected = Buffer.from(this.credentials.hash, "hex");
      if (hash.length !== expected.length || !timingSafeEqual(hash, expected)) {
        this.attempts++;
        this.nextAttempt =
          Date.now() +
          Math.min(30_000, 1000 * 2 ** Math.min(this.attempts - 1, 5));
        throw new FileError("Incorrect current access key.", 401);
      }
      const salt = randomBytes(32).toString("hex");
      const next = {
        ...this.credentials,
        salt,
        hash: ((await derive(newKey, salt, 64)) as Buffer).toString("hex"),
      };
      const temp = this.file + "." + randomBytes(8).toString("hex") + ".tmp";
      try {
        await fs.writeFile(temp, JSON.stringify(next), {
          flag: "wx",
          mode: 0o600,
        });
        await fs.rename(temp, this.file);
      } finally {
        await fs.rm(temp, { force: true });
      }
      this.credentials = next;
      this.attempts = 0;
      this.nextAttempt = 0;
      this.lock();
    } finally {
      this.checking = false;
    }
  }
  lock() {
    this.sessions.clear();
    for (const stop of this.streams.keys()) stop();
    this.streams.clear();
    this.onLocked();
  }
  async setIdle(minutes: number) {
    if (this.checking)
      throw new FileError("Please wait before changing settings.", 409);
    if (![0, 5, 15, 30, 60].includes(minutes) || !this.credentials)
      throw new FileError("Choose a valid lock timeout.");
    this.checking = true;
    try {
      const updated = { ...this.credentials, idleMinutes: minutes };
      const temp = this.file + ".tmp";
      await fs.writeFile(temp, JSON.stringify(updated), { mode: 0o600 });
      await fs.rename(temp, this.file);
      this.credentials = updated;
      for (const session of this.sessions.values())
        session.activity = Date.now();
    } finally {
      this.checking = false;
    }
  }
}
