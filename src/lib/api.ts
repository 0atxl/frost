import type {
  DirectoryListing,
  FileEntry,
  OperationResult,
  Session,
  TextPreview,
  TrashEntry,
  LockStatus,
  Device,
  DesktopApplication,
  FindResponse,
} from "../../shared/types";
let token = "";
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Frost-Token": token,
      ...options?.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith("/api/auth/")) {
      token = "";
      window.dispatchEvent(new Event("frost:locked"));
    }
    const result = await response.json().catch(() => ({
      error: "Frost could not connect. Check that the local server is running.",
    }));
    throw new Error(result.error || "The operation failed.");
  }
  return response.json();
}
function post<T>(url: string, data: unknown) {
  return request<T>(url, { method: "POST", body: JSON.stringify(data) });
}
export const api = {
  lockStatus: () => request<LockStatus>("/api/auth/status"),
  unlock: (key: string, setup = false) =>
    post<LockStatus>("/api/auth/unlock", { key, setup }),
  lock: () => post<{ ok: boolean }>("/api/auth/lock", {}),
  activity: () => post<{ ok: boolean }>("/api/auth/activity", {}),
  lockSettings: (idleMinutes: number) =>
    post<LockStatus>("/api/auth/settings", { idleMinutes }),
  changeKey: (currentKey: string, newKey: string) =>
    post<{ ok: boolean }>("/api/auth/key", { currentKey, newKey }),
  devices: () => request<Device[]>("/api/devices"),
  openExternal: (path: string, application?: string) =>
    post<{ ok: boolean }>("/api/open", { path, application }),
  applications: (path: string, signal?: AbortSignal) =>
    request<DesktopApplication[]>(
      `/api/applications?${new URLSearchParams({ path })}`,
      { signal },
    ),
  find: (
    path: string,
    query: string,
    mode: "names" | "contents",
    recursive: boolean,
    hidden: boolean,
    signal?: AbortSignal,
  ) =>
    request<FindResponse>(
      `/api/find?${new URLSearchParams({ path, query, mode, recursive: recursive ? "1" : "0", hidden: hidden ? "1" : "0" })}`,
      { signal },
    ),
  async session() {
    const session = await request<Session>("/api/session");
    token = session.token;
    return session;
  },
  list: (path: string, hidden: boolean, signal?: AbortSignal) =>
    request<DirectoryListing>(
      `/api/list?${new URLSearchParams({ path, hidden: hidden ? "1" : "0" })}`,
      { signal },
    ),
  text: (path: string, signal?: AbortSignal) =>
    request<TextPreview>(`/api/text?${new URLSearchParams({ path })}`, {
      signal,
    }),
  mkdir: (parent: string, name: string) =>
    post<FileEntry>("/api/folders", { parent, name }),
  rename: (path: string, name: string) =>
    post<FileEntry>("/api/rename", { path, name }),
  transfer: (paths: string[], destination: string, mode: "copy" | "move") =>
    post<OperationResult>("/api/transfer", { paths, destination, mode }),
  trash: (paths: string[]) => post<OperationResult>("/api/trash", { paths }),
  listTrash: () => request<TrashEntry[]>("/api/trash"),
  restore: (id: string) => post<FileEntry>("/api/restore", { id }),
  deleteTrash: (ids: string[]) =>
    post<OperationResult>("/api/trash/delete", { ids }),
};
export function fileUrl(file: FileEntry, download = false) {
  return `/api/file?${new URLSearchParams({ path: file.path, v: file.modified, ...(download ? { download: "1" } : {}) })}`;
}
export function thumbnailUrl(file: FileEntry) {
  return file.extension === "svg"
    ? fileUrl(file)
    : `/api/thumbnail?${new URLSearchParams({ path: file.path, v: file.modified })}`;
}
