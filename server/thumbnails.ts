import * as fs from "node:fs/promises";
import sharp from "sharp";
import { ByteCache } from "../shared/byte-cache.js";
import { FileError } from "./filesystem.js";

export class Thumbnails {
  private cache = new ByteCache<Buffer>(32 * 1024 * 1024);
  private pending = new Map<string, Promise<Buffer>>();
  private generation = 0;
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor() {
    sharp.concurrency(2);
    // The application owns the thumbnail cache; avoid a second libvips cache.
    sharp.cache(false);
  }
  clear() {
    this.generation++;
    this.cache.clear();
    this.pending.clear();
  }
  private async acquire() {
    if (this.active < 2) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }
  private release() {
    const next = this.waiting.shift();
    if (next)
      next(); // Transfer the existing slot to the waiting job.
    else this.active--;
  }
  async get(file: string): Promise<Buffer> {
    const generation = this.generation;
    const stat = await fs.stat(file);
    if (generation !== this.generation)
      throw new FileError("Frost is locked.", 401);
    if (!stat.isFile() || stat.size > 100 * 1024 * 1024)
      throw new FileError("This image is too large for a thumbnail.", 413);
    const key = `${file}\0${stat.mtimeMs}\0${stat.size}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const pending = this.pending.get(key);
    if (pending) return pending;
    this.cache.deleteWhere((old) => old.startsWith(file + "\0") && old !== key);
    const job = (async () => {
      await this.acquire();
      try {
        if (generation !== this.generation)
          throw new FileError("Frost is locked.", 401);
        const image = await sharp(file, {
          limitInputPixels: 64_000_000,
          animated: false,
        })
          .rotate()
          .resize(400, 280, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer();
        if (generation === this.generation) {
          const latest = await fs.stat(file);
          if (
            generation === this.generation &&
            latest.mtimeMs === stat.mtimeMs &&
            latest.size === stat.size
          )
            this.cache.set(key, image, image.byteLength);
        }
        return image;
      } finally {
        this.release();
      }
    })();
    this.pending.set(key, job);
    try {
      return await job;
    } finally {
      if (this.pending.get(key) === job) this.pending.delete(key);
    }
  }
}
