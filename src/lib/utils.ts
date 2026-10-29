import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FileEntry } from "../../shared/types";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024,
    i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[i]}`;
}
export function formatDate(date: string, full = false) {
  if (!Number.isFinite(new Date(date).getTime())) return "Unknown";
  return new Intl.DateTimeFormat(
    undefined,
    full
      ? { dateStyle: "medium", timeStyle: "short" }
      : {
          month: "short",
          day: "numeric",
          year:
            new Date(date).getFullYear() === new Date().getFullYear()
              ? undefined
              : "numeric",
        },
  ).format(new Date(date));
}
export function fileType(file: FileEntry) {
  if (file.kind === "folder") return "Folder";
  if (file.kind === "pdf") return "PDF document";
  if (["md", "markdown"].includes(file.extension)) return "Markdown document";
  const label = {
    image: "image",
    video: "video",
    audio: "audio",
    code: "source",
    archive: "archive",
    text: "document",
    unknown: "file",
  }[file.kind];
  return file.extension
    ? `${file.extension.toUpperCase()} ${label}`
    : file.kind === "unknown"
      ? "File"
      : `${label[0].toUpperCase()}${label.slice(1)}`;
}
export function shortenPath(path: string, home: string) {
  return path === home
    ? "~"
    : path.startsWith(home + "/")
      ? "~" + path.slice(home.length)
      : path;
}
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Browsing still works without storage. */
  }
}
export type SortBy = "name" | "modified" | "size" | "type";
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
export function sortFiles(
  files: FileEntry[],
  sort: SortBy,
  direction: "asc" | "desc",
) {
  return [...files].sort((a, b) => {
    if ((a.kind === "folder") !== (b.kind === "folder"))
      return a.kind === "folder" ? -1 : 1;
    const value =
      sort === "modified"
        ? a.modified.localeCompare(b.modified)
        : sort === "size"
          ? a.size - b.size
          : sort === "type"
            ? collator.compare(fileType(a), fileType(b))
            : collator.compare(a.name, b.name);
    return (
      (direction === "asc" ? 1 : -1) * value || collator.compare(a.name, b.name)
    );
  });
}
