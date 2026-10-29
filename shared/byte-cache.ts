/** An in-memory LRU bounded by payload bytes and entry count. */
export class ByteCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;
  constructor(
    private maxBytes: number,
    private maxEntries = 1024,
  ) {}

  get(key: string): T | undefined {
    const item = this.entries.get(key);
    if (!item) return undefined;
    this.entries.delete(key);
    this.entries.set(key, item);
    return item.value;
  }
  set(key: string, value: T, bytes: number) {
    this.delete(key);
    if (bytes > this.maxBytes || bytes < 0) return;
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries)
      this.delete(this.entries.keys().next().value!);
  }
  delete(key: string) {
    const item = this.entries.get(key);
    if (!item) return;
    this.bytes -= item.bytes;
    this.entries.delete(key);
  }
  deleteWhere(predicate: (key: string) => boolean) {
    for (const key of this.entries.keys()) if (predicate(key)) this.delete(key);
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}
