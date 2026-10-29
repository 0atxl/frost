export type FileKind =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "code"
  | "archive"
  | "unknown";
export interface FileEntry {
  name: string;
  path: string;
  kind: FileKind;
  extension: string;
  mime: string;
  size: number;
  modified: string;
  created: string;
  isSymlink: boolean;
  accessible: boolean;
  writable: boolean;
}
export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: FileEntry[];
  hiddenCount: number;
  readOnly: boolean;
}
export interface Device {
  id: string;
  name: string;
  path: string | null;
  readOnly: boolean;
  removable: boolean;
}
export interface LockStatus {
  setupRequired: boolean;
  unlocked: boolean;
  idleMinutes: number;
}
export interface Session {
  token: string;
  home: string;
  root: string;
  initialPath: string;
  places: { name: string; path: string }[];
}
export interface TextPreview {
  text: string;
  truncated: boolean;
  binary: boolean;
}
export interface TrashEntry {
  id: string;
  name: string;
  originalPath: string;
  trashedAt: string;
  source?: "system" | "legacy";
}
export interface OperationResult {
  completed: string[];
  errors: { path: string; message: string }[];
  trashIds?: string[];
}
export interface DesktopApplication {
  id: string;
  name: string;
  isDefault: boolean;
}
export interface FindResult {
  file: FileEntry;
  relativePath: string;
  line?: number;
  snippet?: string;
}
export interface FindResponse {
  results: FindResult[];
  scanned: number;
  skipped: number;
  limited: boolean;
}
