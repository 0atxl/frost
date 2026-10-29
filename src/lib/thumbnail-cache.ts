import { ByteCache } from "../../shared/byte-cache";
import type { FileEntry } from "../../shared/types";
import { thumbnailUrl } from "./api";

type Subscriber = { loaded: (blob: Blob) => void; failed: () => void };
type Job = {
  key: string;
  url: string;
  generation: number;
  controller: AbortController;
  subscribers: Set<Subscriber>;
};
const cache = new ByteCache<Blob>(32 * 1024 * 1024);
const pending = new Map<string, Job>();
let queue: Job[] = [];
let generation = 0;
let active = 0;

export function thumbnailKey(file: FileEntry) {
  return `${file.path}\0${file.modified}\0${file.size}`;
}
export function clearThumbnailCache() {
  generation++;
  cache.clear();
  for (const job of pending.values()) job.controller.abort();
  pending.clear();
  queue = [];
}
async function run(job: Job) {
  try {
    const response = await fetch(job.url, {
      credentials: "same-origin",
      cache: "no-store",
      signal: job.controller.signal,
    });
    if (response.status === 401 && !job.controller.signal.aborted)
      window.dispatchEvent(new Event("frost:locked"));
    if (!response.ok) throw new Error("Thumbnail unavailable");
    const blob = await response.blob();
    if (job.controller.signal.aborted || job.generation !== generation) return;
    cache.set(job.key, blob, blob.size);
    for (const subscriber of job.subscribers) subscriber.loaded(blob);
  } catch {
    if (!job.controller.signal.aborted && job.generation === generation)
      for (const subscriber of job.subscribers) subscriber.failed();
  } finally {
    if (pending.get(job.key) === job) pending.delete(job.key);
    active--;
    drain();
  }
}
function drain() {
  while (active < 2 && queue.length) {
    const job = queue.shift()!;
    if (job.controller.signal.aborted || !job.subscribers.size) continue;
    active++;
    void run(job);
  }
}
export function requestThumbnail(
  file: FileEntry,
  subscriber: Subscriber,
): () => void {
  const key = thumbnailKey(file);
  const cached = cache.get(key);
  if (cached) {
    subscriber.loaded(cached);
    return () => {};
  }
  cache.deleteWhere((old) => old.startsWith(file.path + "\0") && old !== key);
  let job = pending.get(key);
  if (!job) {
    job = {
      key,
      url: thumbnailUrl(file),
      generation,
      controller: new AbortController(),
      subscribers: new Set(),
    };
    pending.set(key, job);
    queue.push(job);
  }
  job.subscribers.add(subscriber);
  drain();
  return () => {
    job.subscribers.delete(subscriber);
    if (!job.subscribers.size && pending.get(key) === job) {
      job.controller.abort();
      pending.delete(key);
      queue = queue.filter((queued) => queued !== job);
    }
  };
}
