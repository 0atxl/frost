import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Ellipsis,
  HardDrive,
  LockKeyhole,
  FileText,
  Info,
  Monitor,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clipboard,
  Download,
  Eye,
  Folder,
  FolderOpen,
  FolderPlus,
  House,
  Image,
  Keyboard,
  LayoutGrid,
  List,
  LoaderCircle,
  Moon,
  PanelLeft,
  Pencil,
  RefreshCw,
  Search,
  Snowflake,
  Star,
  Sun,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Toaster } from "sonner";
import { toast } from "./components/ui/notifications";
import topbar from "topbar";
import type {
  DirectoryListing,
  Device,
  FileEntry,
  OperationResult,
  Session,
  TrashEntry,
} from "../shared/types";
import { api } from "./lib/api";
import {
  cn,
  formatDate,
  readStorage,
  shortenPath,
  sortFiles,
  writeStorage,
  type SortBy,
} from "./lib/utils";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog";
import { Tip, TooltipProvider } from "./components/ui/tooltip";
import {
  fileActionsFor,
  fileActionDisabled,
  FileBrowser,
  type FileAction,
} from "./components/file-browser";
import { Preview } from "./components/preview";
import { QuickView } from "./components/quick-view";
import { ChangeKey } from "./components/change-key";
import { OpenWithSubmenu } from "./components/open-with";
import { FindPanel } from "./components/find-panel";

interface Pin {
  name: string;
  path: string;
}
interface EditDialog {
  type: "folder" | "rename" | "move" | "trash";
  files: FileEntry[];
  value: string;
}
interface ClipboardState {
  mode: "copy" | "move";
  files: FileEntry[];
}
const placeIcons: Record<string, typeof House> = {
  Home: House,
  Downloads: Download,
  Documents: Folder,
  Pictures: Image,
  Projects: Folder,
};

export function App({
  onLock,
  idleMinutes,
  onIdleChange,
}: {
  onLock: () => Promise<void>;
  idleMinutes: number;
  onIdleChange: (minutes: number) => Promise<void>;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceError, setDeviceError] = useState(false);
  const [purgeItems, setPurgeItems] = useState<TrashEntry[] | null>(null);
  const [purgeError, setPurgeError] = useState("");
  const changes = useRef<BroadcastChannel | null>(null);
  const [session, setSession] = useState<Session | null>(null),
    [bootError, setBootError] = useState("");
  const [path, setPath] = useState(""),
    [listing, setListing] = useState<DirectoryListing | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [view, setView] = useState<"grid" | "list">(() =>
      readStorage("frost:layout-view", "list"),
    );
  const [sort, setSort] = useState<SortBy>(() =>
      readStorage("frost:sort", "name"),
    ),
    [direction, setDirection] = useState<"asc" | "desc">(() =>
      readStorage("frost:direction", "asc"),
    );
  const [sidebar, setSidebar] = useState(() =>
      readStorage("frost:layout-sidebar", window.innerWidth > 600),
    ),
    [preview, setPreview] = useState(() => readStorage("frost:preview", false)),
    [hidden, setHidden] = useState(() => readStorage("frost:hidden", false));
  const [theme, setTheme] = useState<"system" | "dark" | "light">(() =>
      readStorage("frost:theme", "system"),
    ),
    [effectiveTheme, setEffectiveTheme] = useState<"dark" | "light">("dark");
  const [pins, setPins] = useState<Pin[]>(() => readStorage("frost:pins", [])),
    [clipboard, setClipboard] = useState<ClipboardState | null>(null),
    [busy, setBusy] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [changeKey, setChangeKey] = useState(false);
  const [findLine, setFindLine] = useState<{
    path: string;
    line: number;
  } | null>(null);
  const [actionsPage, setActionsPage] = useState<
    "main" | "selection" | "appearance" | "lock"
  >("main");
  const [editingPath, setEditingPath] = useState(false),
    [pathInput, setPathInput] = useState(""),
    [quickLook, setQuickLook] = useState<FileEntry | null>(null),
    [editDialog, setEditDialog] = useState<EditDialog | null>(null),
    [dialogError, setDialogError] = useState(""),
    [shortcuts, setShortcuts] = useState(false);
  const [showTrash, setShowTrash] = useState(false),
    [trash, setTrash] = useState<TrashEntry[]>([]),
    [trashLoading, setTrashLoading] = useState(false),
    [trashError, setTrashError] = useState("");
  const [previewWidth, setPreviewWidth] = useState(() =>
    readStorage("frost:inspector-width", 280),
  );
  const [navIndex, setNavIndex] = useState(0),
    [navLength, setNavLength] = useState(1);
  const history = useRef<string[]>([]),
    pathRef = useRef<HTMLInputElement>(null),
    searchRef = useRef<HTMLInputElement>(null),
    lastSelected = useRef<string | null>(null),
    loadSequence = useRef(0);
  const currentPath = listing?.path || path;
  const crumbsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (crumbsRef.current)
      crumbsRef.current.scrollLeft = crumbsRef.current.scrollWidth;
  }, [currentPath, editingPath, showTrash]);

  useEffect(() => {
    let active = true;
    api
      .session()
      .then((data) => {
        if (!active) return;
        setSession(data);
        const initial =
          new URLSearchParams(window.location.search).get("path") ||
          data.initialPath;
        history.current = [initial];
        window.history.replaceState(
          { frostIndex: 0 },
          "",
          `?${new URLSearchParams({ path: initial })}`,
        );
        setPath(initial);
      })
      .catch((e) => {
        if (active) setBootError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const result =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = result;
      setEffectiveTheme(result);
    };
    apply();
    media.addEventListener("change", apply);
    writeStorage("frost:theme", theme);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    writeStorage("frost:layout-view", view);
    writeStorage("frost:sort", sort);
    writeStorage("frost:direction", direction);
    writeStorage("frost:layout-sidebar", sidebar);
    writeStorage("frost:preview", preview);
    writeStorage("frost:hidden", hidden);
    writeStorage("frost:pins", pins);
    writeStorage("frost:inspector-width", previewWidth);
  }, [view, sort, direction, sidebar, preview, hidden, pins, previewWidth]);
  useEffect(() => {
    if (!session || !path) return;
    const sequence = ++loadSequence.current,
      controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .list(path, hidden, controller.signal)
      .then((data) => {
        if (sequence !== loadSequence.current) return;
        setListing(data);
        setSelected(
          (prev) =>
            new Set(
              [...prev].filter((p) =>
                data.entries.some((entry) => entry.path === p),
              ),
            ),
        );
        writeStorage("frost:last-path", data.path);
        setPathInput(data.path);
        document.title = `${data.path.split("/").pop() || "Files"} · Frost`;
        window.history.replaceState(
          { frostIndex: navIndex },
          "",
          `?${new URLSearchParams({ path: data.path })}`,
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError" && sequence === loadSequence.current) {
          setError(e.message);
          setListing(null);
        }
      })
      .finally(() => {
        if (sequence === loadSequence.current) setLoading(false);
      });
    return () => controller.abort();
    // Navigation owns the browser history index; changing it alone should not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, path, hidden, revision]);
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      const next = new URLSearchParams(window.location.search).get("path");
      if (!next) return;
      setNavIndex(Number(event.state?.frostIndex) || 0);
      setPath(next);
      setListing(null);
      setSelected(new Set());
      setQuery("");
      setShowTrash(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const focus = () => {
      if (!busy && !editDialog) setRevision((r) => r + 1);
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [busy, editDialog]);
  const loadTrash = useCallback(async () => {
    setTrashLoading(true);
    setTrashError("");
    try {
      setTrash(await api.listTrash());
    } catch (e) {
      setTrashError((e as Error).message);
    } finally {
      setTrashLoading(false);
    }
  }, []);
  useEffect(() => {
    if (showTrash) void loadTrash();
  }, [showTrash, loadTrash, revision]);
  useEffect(() => {
    changes.current = new BroadcastChannel("frost:files");
    changes.current.onmessage = () => setRevision((value) => value + 1);
    return () => changes.current?.close();
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true,
      pending = false;
    const load = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const result = await api.devices();
        if (active) {
          setDevices(result);
          setDeviceError(false);
        }
      } catch {
        if (active) setDeviceError(true);
      } finally {
        pending = false;
      }
    };
    void load();
    const timer = window.setInterval(load, 8000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [session]);
  useEffect(() => {
    topbar.config({
      barThickness: 2,
      barColors: { 0: effectiveTheme === "dark" ? "#4b9bff" : "#0a64f0" },
      shadowBlur: 0,
      className: "frost-loading-bar",
    });
    if (loading || trashLoading) topbar.show(300);
    else topbar.hide();
    return () => topbar.hide();
  }, [loading, trashLoading, effectiveTheme]);
  const refresh = () => {
    setRevision((r) => r + 1);
    changes.current?.postMessage("changed");
  };
  const go = useCallback(
    (destination: string) => {
      if (!destination.trim() || !session) return;
      const next = destination.trim();
      setShowTrash(false);
      setEditingPath(false);
      if (window.innerWidth <= 600) setSidebar(false);
      setQuickLook(null);
      setSelected(new Set());
      setQuery("");
      lastSelected.current = null;
      if (
        next === currentPath ||
        next === shortenPath(currentPath, session.home)
      ) {
        setRevision((r) => r + 1);
        return;
      }
      history.current = history.current.slice(0, navIndex + 1);
      history.current.push(next);
      const index = history.current.length - 1;
      setNavIndex(index);
      setNavLength(history.current.length);
      window.history.pushState(
        { frostIndex: index },
        "",
        `?${new URLSearchParams({ path: next })}`,
      );
      setListing(null);
      setPath(next);
      setPathInput(next);
    },
    [session, currentPath, navIndex],
  );
  const visible = useMemo(
    () =>
      sortFiles(
        (listing?.entries || []).filter((file) =>
          file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        ),
        sort,
        direction,
      ),
    [listing, query, sort, direction],
  );
  const selectedFiles = useMemo(
    () => listing?.entries.filter((file) => selected.has(file.path)) || [],
    [listing, selected],
  );
  const focusedFile = selectedFiles.length === 1 ? selectedFiles[0] : null;
  const cutPaths = useMemo(
    () =>
      new Set(
        clipboard?.mode === "move"
          ? clipboard.files.map((file) => file.path)
          : [],
      ),
    [clipboard],
  );
  const pinned = pins.some((pin) => pin.path === currentPath);
  function togglePin() {
    if (!listing) return;
    setPins((old) =>
      pinned
        ? old.filter((pin) => pin.path !== currentPath)
        : [
            ...old,
            {
              name: currentPath.split("/").pop() || "Files",
              path: currentPath,
            },
          ],
    );
    toast(pinned ? "Folder unpinned" : "Folder pinned");
  }
  function select(
    file: FileEntry,
    event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) {
    setSelected((prev) => {
      if (event.shiftKey && lastSelected.current) {
        const start = visible.findIndex((f) => f.path === lastSelected.current),
          end = visible.findIndex((f) => f.path === file.path);
        if (start >= 0 && end >= 0)
          return new Set(
            visible
              .slice(Math.min(start, end), Math.max(start, end) + 1)
              .map((f) => f.path),
          );
      }
      if (event.metaKey || event.ctrlKey) {
        const next = new Set(prev);
        next.has(file.path) ? next.delete(file.path) : next.add(file.path);
        return next;
      }
      return new Set([file.path]);
    });
    if (!event.shiftKey) lastSelected.current = file.path;
  }
  function open(file: FileEntry) {
    if (!file.accessible) {
      toast.error("This item is unavailable or outside the allowed folders.");
      return;
    }
    if (file.kind === "folder") go(file.path);
    else {
      setFindLine(null);
      setQuickLook(file);
    }
  }
  async function copyPath(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Path copied");
    } catch {
      toast.error("Your browser could not copy the path.", {
        description: value,
        duration: 8000,
      });
    }
  }
  function beginEdit(
    type: EditDialog["type"],
    files: FileEntry[] = selectedFiles,
  ) {
    if (
      type === "folder"
        ? listing?.readOnly
        : files.some((file) => !file.writable)
    )
      return;
    setDialogError("");
    setEditDialog({
      type,
      files,
      value:
        type === "rename"
          ? files[0]?.name || ""
          : type === "move"
            ? currentPath
            : "",
    });
  }
  function handleAction(action: FileAction, files = selectedFiles) {
    if (!files.length || busy || fileActionDisabled(action, files)) return;
    const file = files[0];
    if (action === "open") go(file.path);
    if (action === "preview") {
      setFindLine(null);
      setQuickLook(file);
    }
    if (action === "new-tab")
      window.open(
        `/?${new URLSearchParams({ path: file.path })}`,
        "_blank",
        "noopener,noreferrer",
      );
    if (action === "external")
      void api
        .openExternal(file.path)
        .catch((error) => toast.error(error.message));
    if (action === "info") {
      setSelected(new Set([file.path]));
      setPreview(true);
    }
    if (action === "rename") beginEdit("rename", files);
    if (action === "move") beginEdit("move", files);
    if (action === "trash") beginEdit("trash", files);
    if (action === "copy" || action === "cut") {
      setClipboard({ mode: action === "cut" ? "move" : "copy", files });
      toast(
        `${files.length} ${files.length === 1 ? "item" : "items"} ready to ${action === "cut" ? "move" : "copy"}`,
        { description: "Open the destination folder and paste." },
      );
    }
    if (action === "copy-path")
      void copyPath(files.map((f) => f.path).join("\n"));
  }

  async function purgeTrash() {
    if (!purgeItems?.length || busy) return;
    setBusy("Deleting permanently");
    setPurgeError("");
    try {
      const result: OperationResult = { completed: [], errors: [] };
      for (let index = 0; index < purgeItems.length; index += 500) {
        const batch = await api.deleteTrash(
          purgeItems.slice(index, index + 500).map((item) => item.id),
        );
        result.completed.push(...batch.completed);
        result.errors.push(...batch.errors);
      }
      if (result.completed.length)
        toast.success(
          `${result.completed.length} ${result.completed.length === 1 ? "item" : "items"} permanently deleted`,
        );
      if (result.errors.length) {
        setPurgeError(result.errors.map((item) => item.message).join(" "));
        setPurgeItems(
          purgeItems.filter((item) =>
            result.errors.some((error) => error.path === item.id),
          ),
        );
      } else setPurgeItems(null);
      refresh();
    } catch (error) {
      setPurgeError((error as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function restoreItems(ids: string[]) {
    setBusy("Restoring files");
    let restored = 0;
    const errors: string[] = [];
    try {
      for (const id of ids) {
        try {
          await api.restore(id);
          restored++;
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      if (restored)
        toast.success(
          `${restored} ${restored === 1 ? "item" : "items"} restored`,
        );
      if (errors.length)
        toast.error("Some items could not be restored", {
          description: errors.join(" "),
          duration: 9000,
        });
      refresh();
    } finally {
      setBusy("");
    }
  }
  function report(result: OperationResult, verb: string) {
    if (result.completed.length)
      toast.success(
        `${result.completed.length} ${result.completed.length === 1 ? "item" : "items"} ${verb}`,
        {
          action: result.trashIds?.length
            ? {
                label: "Undo",
                onClick: () => void restoreItems(result.trashIds!),
              }
            : undefined,
          duration: result.trashIds?.length ? 12000 : 4000,
        },
      );
    if (result.errors.length)
      toast.error(
        `${result.errors.length} ${result.errors.length === 1 ? "item was" : "items were"} skipped`,
        {
          description: result.errors
            .slice(0, 3)
            .map((item) => `${item.path.split("/").pop()}: ${item.message}`)
            .join("\n"),
          duration: 10000,
        },
      );
  }
  async function paste() {
    if (!clipboard || busy || !listing || listing.readOnly) return;
    setBusy(clipboard.mode === "copy" ? "Copying files" : "Moving files");
    try {
      const result = await api.transfer(
        clipboard.files.map((f) => f.path),
        currentPath,
        clipboard.mode,
      );
      report(result, clipboard.mode === "copy" ? "copied" : "moved");
      if (clipboard.mode === "move")
        setClipboard(
          result.errors.length
            ? {
                ...clipboard,
                files: clipboard.files.filter((file) =>
                  result.errors.some((error) => error.path === file.path),
                ),
              }
            : null,
        );
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editDialog || busy) return;
    const dialog = editDialog;
    setBusy(
      dialog.type === "trash"
        ? "Moving to Trash"
        : dialog.type === "move"
          ? "Moving files"
          : "Saving changes",
    );
    setDialogError("");
    try {
      if (dialog.type === "folder") {
        const file = await api.mkdir(currentPath, dialog.value.trim());
        toast.success("Folder created");
        setSelected(new Set([file.path]));
      }
      if (dialog.type === "rename") {
        const file = await api.rename(
          dialog.files[0].path,
          dialog.value.trim(),
        );
        toast.success("File renamed");
        setSelected(new Set([file.path]));
      }
      if (dialog.type === "move") {
        const result = await api.transfer(
          dialog.files.map((f) => f.path),
          dialog.value.trim(),
          "move",
        );
        report(result, "moved");
      }
      if (dialog.type === "trash") {
        const result = await api.trash(dialog.files.map((f) => f.path));
        report(result, "moved to Trash");
      }
      setEditDialog(null);
      refresh();
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const onSort = (column: SortBy) => {
    if (column === sort)
      setDirection((old) => (old === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setDirection(column === "modified" || column === "size" ? "desc" : "asc");
    }
  };
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (
        editDialog ||
        purgeItems ||
        shortcuts ||
        findOpen ||
        changeKey ||
        event.defaultPrevented
      )
        return;
      if ((event.target as HTMLElement).closest('[role="menu"]')) return;
      const input = (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      );
      if (event.key === "Escape" && !input) {
        if (quickLook) {
          setQuickLook(null);
          return;
        }
        setSelected(new Set());
        setQuery("");
        return;
      }
      if (input) return;
      if (quickLook) {
        if (event.code === "Space") {
          event.preventDefault();
          if (!event.repeat) setQuickLook(null);
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const files = visible.filter((f) => f.kind !== "folder"),
            index = files.findIndex((f) => f.path === quickLook.path);
          const next = files[index + (event.key === "ArrowLeft" ? -1 : 1)];
          if (index >= 0 && next) {
            setFindLine(null);
            setQuickLook(next);
          }
        }
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "k" && !showTrash) {
        event.preventDefault();
        setFindOpen(true);
        return;
      }
      if (mod && event.shiftKey && event.code === "Period") {
        event.preventDefault();
        setHidden((value) => !value);
        return;
      }
      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelected(new Set(visible.map((f) => f.path)));
      }
      if (mod && event.key.toLowerCase() === "c" && selected.size) {
        event.preventDefault();
        handleAction("copy");
      }
      if (mod && event.key.toLowerCase() === "x" && selected.size) {
        event.preventDefault();
        handleAction("cut");
      }
      if (mod && event.key.toLowerCase() === "v" && clipboard) {
        event.preventDefault();
        void paste();
      }
      if (event.code === "Space" && focusedFile) {
        event.preventDefault();
        if (!event.repeat) open(focusedFile);
      }
      if (event.key === "F2" && focusedFile) {
        event.preventDefault();
        beginEdit("rename");
      }
      if (event.key === "Delete" && selected.size && !busy) {
        event.preventDefault();
        beginEdit("trash");
      }
      if (event.key === "/") {
        event.preventDefault();
        setEditingPath(true);
        requestAnimationFrame(() => {
          pathRef.current?.focus();
          pathRef.current?.select();
        });
      }
      if (event.key === "f" && !mod) {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  if (bootError)
    return (
      <div className="startup-screen">
        <Snowflake size={36} />
        <h1>Frost could not connect</h1>
        <p>{bootError}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  if (!session)
    return (
      <div className="startup-screen">
        <Snowflake size={36} />
        <span className="startup-name">Frost</span>
        <LoaderCircle size={18} className="spin" />
      </div>
    );

  const title = showTrash
    ? "Trash"
    : currentPath === session.home
      ? "Home"
      : currentPath.split("/").filter(Boolean).pop() || "Files";
  const editPath = () => {
    setPathInput(currentPath);
    setShowTrash(false);
    setEditingPath(true);
    requestAnimationFrame(() => {
      pathRef.current?.focus();
      pathRef.current?.select();
    });
  };
  const modalTitle =
    editDialog?.type === "folder"
      ? "New folder"
      : editDialog?.type === "rename"
        ? "Rename item"
        : editDialog?.type === "move"
          ? "Move to a folder"
          : "Move to Trash?";

  return (
    <TooltipProvider delayDuration={350}>
      <div className={cn("app-shell", sidebar && "with-sidebar")}>
        {sidebar && (
          <aside className="sidebar" aria-label="Folder navigation">
            <div className="sidebar-brand">
              <span className="frost-brand">
                <Snowflake size={19} />
                Frost
              </span>
              <Tip label="Hide sidebar">
                <Button
                  size="icon"
                  aria-label="Hide sidebar"
                  onClick={() => setSidebar(false)}
                >
                  <PanelLeft />
                </Button>
              </Tip>
            </div>
            <div className="sidebar-group">
              <span className="section-label">Favorites</span>
              {session.places.map((place) => {
                const Icon = placeIcons[place.name] || Folder;
                return (
                  <button
                    key={place.path}
                    className={cn(
                      "nav-item",
                      !showTrash && currentPath === place.path && "active",
                    )}
                    aria-current={
                      !showTrash && currentPath === place.path
                        ? "page"
                        : undefined
                    }
                    onClick={() => go(place.path)}
                  >
                    <Icon size={15} />
                    <span>{place.name}</span>
                  </button>
                );
              })}
            </div>
            {pins.length > 0 && (
              <div className="sidebar-group">
                <span className="section-label">Pinned</span>
                {pins.map((pin) => (
                  <button
                    key={pin.path}
                    className={cn(
                      "nav-item",
                      !showTrash && currentPath === pin.path && "active",
                    )}
                    onClick={() => go(pin.path)}
                    title={pin.path}
                  >
                    <Folder size={15} />
                    <span>{pin.name}</span>
                  </button>
                ))}
              </div>
            )}
            {(devices.length > 0 || deviceError) && (
              <div className="sidebar-group">
                <span className="section-label">Devices</span>
                {devices.map((device) => (
                  <button
                    key={device.id}
                    className={cn(
                      "nav-item",
                      !showTrash && device.path === currentPath && "active",
                    )}
                    disabled={!device.path}
                    title={
                      device.path
                        ? `${device.path}${device.readOnly ? " · Read-only" : ""}`
                        : "Not mounted. Open it in your system file manager to mount it."
                    }
                    onClick={() => device.path && go(device.path)}
                  >
                    <HardDrive size={15} />
                    <span>{device.name}</span>
                    {device.readOnly && <LockKeyhole size={11} />}
                  </button>
                ))}
                {deviceError && (
                  <span className="device-note">Devices unavailable</span>
                )}
              </div>
            )}
            <div className="sidebar-bottom">
              <button
                className={cn("nav-item", showTrash && "active")}
                onClick={() => setShowTrash(true)}
              >
                <Trash2 size={15} />
                <span>Trash</span>
              </button>
            </div>
          </aside>
        )}
        <main className="main-shell">
          <header className={cn("topbar", searchOpen && "search-expanded")}>
            {!sidebar && (
              <div className="collapsed-brand">
                <span className="frost-brand">
                  <Snowflake size={18} />
                  Frost
                </span>
                <Tip label="Show sidebar">
                  <Button
                    size="icon"
                    aria-label="Show sidebar"
                    onClick={() => setSidebar(true)}
                  >
                    <PanelLeft />
                  </Button>
                </Tip>
              </div>
            )}
            <div className="navigation-buttons">
              <Tip label="Back">
                <Button
                  size="icon"
                  aria-label="Back"
                  disabled={navIndex <= 0 && !showTrash}
                  onClick={() =>
                    showTrash ? setShowTrash(false) : window.history.back()
                  }
                >
                  <ChevronLeft />
                </Button>
              </Tip>
              <Tip label="Forward">
                <Button
                  size="icon"
                  aria-label="Forward"
                  disabled={navIndex >= navLength - 1 || showTrash}
                  onClick={() => window.history.forward()}
                >
                  <ChevronRight />
                </Button>
              </Tip>
              <Tip label="Parent folder">
                <Button
                  size="icon"
                  aria-label="Parent folder"
                  disabled={!listing?.parent || showTrash}
                  onClick={() => listing?.parent && go(listing.parent)}
                >
                  <ArrowUp />
                </Button>
              </Tip>
            </div>
            {editingPath ? (
              <form
                className="path-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  go(pathInput);
                }}
              >
                <input
                  ref={pathRef}
                  aria-label="Folder path"
                  value={pathInput}
                  placeholder="Enter a folder path"
                  spellCheck={false}
                  autoComplete="off"
                  list="folder-suggestions"
                  onChange={(event) => setPathInput(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  onBlur={() => setEditingPath(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setEditingPath(false);
                      setPathInput(currentPath);
                    }
                  }}
                />
                <datalist id="folder-suggestions">
                  {[
                    ...session.places,
                    ...pins,
                    ...(listing?.entries.filter(
                      (file) => file.kind === "folder",
                    ) || []),
                  ].map((place, i) => (
                    <option
                      key={`${place.path}-${i}`}
                      value={shortenPath(place.path, session.home)}
                    />
                  ))}
                </datalist>
                <Button
                  size="icon"
                  type="submit"
                  aria-label="Open path"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <ArrowRight />
                </Button>
              </form>
            ) : (
              <nav
                ref={crumbsRef}
                className="path-breadcrumbs"
                aria-label="Folder path"
                onClick={(event) => {
                  if (event.target === event.currentTarget) editPath();
                }}
              >
                {showTrash ? (
                  <span>Trash</span>
                ) : (
                  (() => {
                    const inHome =
                      currentPath === session.home ||
                      currentPath.startsWith(session.home + "/");
                    const base = inHome ? session.home : "/";
                    const parts = (
                      inHome
                        ? currentPath.slice(session.home.length)
                        : currentPath
                    )
                      .split("/")
                      .filter(Boolean);
                    const crumbs = [
                      { label: inHome ? "Home" : "Filesystem", path: base },
                      ...parts.map((label, index) => ({
                        label,
                        path:
                          (base === "/" ? "" : base) +
                          "/" +
                          parts.slice(0, index + 1).join("/"),
                      })),
                    ];
                    return crumbs.map((crumb, index) => (
                      <span className="path-crumb" key={crumb.path}>
                        {index > 0 && (
                          <ChevronRight size={12} aria-hidden="true" />
                        )}
                        <button
                          aria-current={
                            index === crumbs.length - 1 ? "page" : undefined
                          }
                          title={
                            index === crumbs.length - 1
                              ? `Edit path: ${currentPath}`
                              : crumb.path
                          }
                          onClick={() =>
                            index === crumbs.length - 1
                              ? editPath()
                              : go(crumb.path)
                          }
                        >
                          {crumb.label}
                        </button>
                      </span>
                    ));
                  })()
                )}
              </nav>
            )}
            <div className="toolbar-actions">
              {!showTrash && (
                <>
                  <Tip label="Find files or contents (Ctrl K)">
                    <Button
                      size="sm"
                      className="find-button"
                      onClick={() => setFindOpen(true)}
                    >
                      <Search size={14} />
                      Find
                    </Button>
                  </Tip>
                  <div className="view-switch" aria-label="File view">
                    <Tip label="List view">
                      <button
                        aria-label="List view"
                        aria-pressed={view === "list"}
                        onClick={() => setView("list")}
                      >
                        <List size={15} />
                      </button>
                    </Tip>
                    <Tip label="Grid view">
                      <button
                        aria-label="Grid view"
                        aria-pressed={view === "grid"}
                        onClick={() => setView("grid")}
                      >
                        <LayoutGrid size={15} />
                      </button>
                    </Tip>
                  </div>
                  <Dropdown.Root>
                    <Dropdown.Trigger asChild>
                      <Button
                        size="sm"
                        className="sort-button"
                        aria-label="Sort files"
                      >
                        <span>
                          {
                            {
                              name: "Name",
                              modified: "Date Modified",
                              size: "Size",
                              type: "Kind",
                            }[sort]
                          }
                        </span>
                        <ChevronDown size={12} />
                      </Button>
                    </Dropdown.Trigger>
                    <Dropdown.Portal>
                      <Dropdown.Content
                        className="menu"
                        align="end"
                        sideOffset={6}
                      >
                        <Dropdown.Label className="menu-label">
                          Sort by
                        </Dropdown.Label>
                        {(["name", "modified", "size", "type"] as SortBy[]).map(
                          (column) => (
                            <Dropdown.Item
                              key={column}
                              className="menu-item"
                              onSelect={() => onSort(column)}
                            >
                              <span>
                                {
                                  {
                                    name: "Name",
                                    modified: "Date Modified",
                                    size: "Size",
                                    type: "Kind",
                                  }[column]
                                }
                              </span>
                              {sort === column && <Check size={14} />}
                            </Dropdown.Item>
                          ),
                        )}
                        <Dropdown.Separator className="menu-separator" />
                        <Dropdown.Item
                          className="menu-item"
                          onSelect={() => setDirection("asc")}
                        >
                          <span>Ascending</span>
                          {direction === "asc" && <Check size={14} />}
                        </Dropdown.Item>
                        <Dropdown.Item
                          className="menu-item"
                          onSelect={() => setDirection("desc")}
                        >
                          <span>Descending</span>
                          {direction === "desc" && <Check size={14} />}
                        </Dropdown.Item>
                      </Dropdown.Content>
                    </Dropdown.Portal>
                  </Dropdown.Root>
                </>
              )}
              <Dropdown.Root
                onOpenChange={(open) => {
                  if (open) setActionsPage("main");
                }}
              >
                <Dropdown.Trigger asChild>
                  <Button size="icon" aria-label="Actions">
                    <Ellipsis />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content
                    className="menu"
                    align="end"
                    sideOffset={6}
                    onCloseAutoFocus={(event) => {
                      if (editingPath) event.preventDefault();
                    }}
                  >
                    {actionsPage === "main" ? (
                      <>
                        {!showTrash && (
                          <>
                            <Dropdown.Item
                              className="menu-item"
                              disabled={!!busy || !listing || listing.readOnly}
                              onSelect={() => beginEdit("folder")}
                            >
                              <FolderPlus size={15} />
                              <span>New folder</span>
                            </Dropdown.Item>
                            <Dropdown.Item
                              className="menu-item"
                              disabled={
                                !!busy ||
                                !clipboard ||
                                !listing ||
                                listing.readOnly
                              }
                              onSelect={() => void paste()}
                            >
                              <Clipboard size={15} />
                              <span>
                                Paste
                                {clipboard
                                  ? ` ${clipboard.files.length} ${clipboard.files.length === 1 ? "item" : "items"}`
                                  : ""}
                              </span>
                              <span className="menu-key">Ctrl V</span>
                            </Dropdown.Item>
                            {selectedFiles.length > 0 && (
                              <Dropdown.Item
                                className="menu-item"
                                onSelect={(event) => {
                                  event.preventDefault();
                                  setActionsPage("selection");
                                }}
                              >
                                <Info size={15} />
                                <span>
                                  {selectedFiles.length === 1
                                    ? "Selected item"
                                    : "Selected items"}
                                </span>
                                <ChevronRight size={14} />
                              </Dropdown.Item>
                            )}
                            <Dropdown.Separator className="menu-separator" />
                            <Dropdown.Item
                              className="menu-item"
                              disabled={!listing}
                              onSelect={togglePin}
                            >
                              <Star size={15} />
                              <span>
                                {pinned ? "Unpin folder" : "Pin folder"}
                              </span>
                            </Dropdown.Item>
                            <Dropdown.Item
                              className="menu-item"
                              disabled={!listing?.parent}
                              onSelect={() =>
                                listing?.parent && go(listing.parent)
                              }
                            >
                              <ArrowUp size={15} />
                              <span>Parent folder</span>
                            </Dropdown.Item>
                            <Dropdown.Item
                              className="menu-item"
                              onSelect={editPath}
                            >
                              <FolderOpen size={15} />
                              <span>Go to folder</span>
                              <span className="menu-key">/</span>
                            </Dropdown.Item>
                          </>
                        )}
                        <Dropdown.Item
                          className="menu-item"
                          disabled={loading || !!busy}
                          onSelect={refresh}
                        >
                          <RefreshCw size={15} />
                          <span>Refresh</span>
                        </Dropdown.Item>
                        <Dropdown.Separator className="menu-separator" />
                        <Dropdown.CheckboxItem
                          className="menu-item"
                          checked={hidden}
                          onCheckedChange={setHidden}
                        >
                          <Eye size={15} />
                          <span>Show hidden files</span>
                          <Dropdown.ItemIndicator>
                            <Check size={14} />
                          </Dropdown.ItemIndicator>
                        </Dropdown.CheckboxItem>
                        <Dropdown.CheckboxItem
                          className="menu-item"
                          checked={sidebar}
                          onCheckedChange={setSidebar}
                        >
                          <PanelLeft size={15} />
                          <span>Show sidebar</span>
                          <Dropdown.ItemIndicator>
                            <Check size={14} />
                          </Dropdown.ItemIndicator>
                        </Dropdown.CheckboxItem>
                        <Dropdown.Item
                          className="menu-item"
                          onSelect={(event) => {
                            event.preventDefault();
                            setActionsPage("appearance");
                          }}
                        >
                          <Sun size={15} />
                          <span>Appearance</span>
                          <ChevronRight size={14} />
                        </Dropdown.Item>
                        <Dropdown.Item
                          className="menu-item"
                          onSelect={() => setShowTrash(true)}
                        >
                          <Trash2 size={15} />
                          <span>Trash</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          className="menu-item"
                          onSelect={() => setChangeKey(true)}
                        >
                          <LockKeyhole size={15} />
                          <span>Change access key</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          className="menu-item"
                          onSelect={() => void onLock()}
                        >
                          <LockKeyhole size={15} />
                          <span>Lock Frost</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          className="menu-item"
                          onSelect={(event) => {
                            event.preventDefault();
                            setActionsPage("lock");
                          }}
                        >
                          <LockKeyhole size={15} />
                          <span>Automatic lock</span>
                          <ChevronRight size={14} />
                        </Dropdown.Item>
                        <Dropdown.Item
                          className="menu-item"
                          onSelect={() => setShortcuts(true)}
                        >
                          <Keyboard size={15} />
                          <span>Keyboard shortcuts</span>
                        </Dropdown.Item>
                      </>
                    ) : (
                      <>
                        <Dropdown.Item
                          className="menu-item"
                          onSelect={(event) => {
                            event.preventDefault();
                            setActionsPage("main");
                          }}
                        >
                          <ChevronLeft size={15} />
                          <span>Back</span>
                        </Dropdown.Item>
                        <Dropdown.Separator className="menu-separator" />
                        <Dropdown.Label className="menu-label">
                          {actionsPage === "appearance"
                            ? "Appearance"
                            : actionsPage === "lock"
                              ? "Lock after inactivity"
                              : "Selected items"}
                        </Dropdown.Label>
                        {actionsPage === "selection" ? (
                          fileActionsFor(
                            focusedFile || undefined,
                            selectedFiles.length,
                          ).map(({ id, label, icon: Icon, shortcut }) =>
                            id === "open-with" ? (
                              <OpenWithSubmenu
                                key={id}
                                file={selectedFiles[0]}
                                kind="dropdown"
                                disabled={
                                  !!busy ||
                                  fileActionDisabled(id, selectedFiles)
                                }
                              />
                            ) : (
                              <Dropdown.Item
                                key={id}
                                className={cn(
                                  "menu-item",
                                  id === "trash" && "menu-danger",
                                )}
                                disabled={
                                  !!busy ||
                                  fileActionDisabled(id, selectedFiles)
                                }
                                onSelect={() => handleAction(id)}
                              >
                                <Icon size={15} />
                                <span>{label}</span>
                                {shortcut && (
                                  <span className="menu-key">{shortcut}</span>
                                )}
                              </Dropdown.Item>
                            ),
                          )
                        ) : actionsPage === "lock" ? (
                          <Dropdown.RadioGroup
                            value={String(idleMinutes)}
                            onValueChange={(value) =>
                              void onIdleChange(Number(value))
                            }
                          >
                            {[0, 5, 15, 30, 60].map((minutes) => (
                              <Dropdown.RadioItem
                                value={String(minutes)}
                                key={minutes}
                                className="menu-item"
                              >
                                <span>
                                  {minutes ? `${minutes} minutes` : "Never"}
                                </span>
                                <Dropdown.ItemIndicator>
                                  <Check size={14} />
                                </Dropdown.ItemIndicator>
                              </Dropdown.RadioItem>
                            ))}
                          </Dropdown.RadioGroup>
                        ) : (
                          <Dropdown.RadioGroup
                            value={theme}
                            onValueChange={(value) =>
                              setTheme(value as typeof theme)
                            }
                          >
                            {(["system", "light", "dark"] as const).map(
                              (option) => (
                                <Dropdown.RadioItem
                                  key={option}
                                  value={option}
                                  className="menu-item"
                                >
                                  {option === "system" ? (
                                    <Monitor size={15} />
                                  ) : option === "light" ? (
                                    <Sun size={15} />
                                  ) : (
                                    <Moon size={15} />
                                  )}
                                  <span>
                                    {option[0].toUpperCase() + option.slice(1)}
                                  </span>
                                  <Dropdown.ItemIndicator>
                                    <Check size={14} />
                                  </Dropdown.ItemIndicator>
                                </Dropdown.RadioItem>
                              ),
                            )}
                          </Dropdown.RadioGroup>
                        )}
                      </>
                    )}
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
              {!showTrash && (
                <>
                  <Tip label={preview ? "Hide inspector" : "Show inspector"}>
                    <Button
                      size="icon"
                      aria-label={preview ? "Hide inspector" : "Show inspector"}
                      aria-pressed={preview}
                      onClick={() => setPreview(!preview)}
                    >
                      <Info />
                    </Button>
                  </Tip>
                  {searchOpen || query ? (
                    <div className="search-input">
                      <Search size={14} />
                      <input
                        autoFocus
                        ref={searchRef}
                        aria-label="Filter this folder"
                        placeholder="Filter this folder"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setSelected(new Set());
                        }}
                        onBlur={() => {
                          if (!query) setSearchOpen(false);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.stopPropagation();
                            setQuery("");
                            setSearchOpen(false);
                          }
                        }}
                      />
                      <button
                        aria-label="Close search"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setQuery("");
                          setSearchOpen(false);
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <Tip label="Filter this folder">
                      <Button
                        size="icon"
                        aria-label="Filter this folder"
                        onClick={() => {
                          setSearchOpen(true);
                          requestAnimationFrame(() =>
                            searchRef.current?.focus(),
                          );
                        }}
                      >
                        <Search />
                      </Button>
                    </Tip>
                  )}
                </>
              )}
            </div>
          </header>
          <div className="workspace">
            {showTrash ? (
              <section className="trash-view">
                <div className="trash-heading">
                  <p className="trash-intro">
                    System Trash
                    {trash.some((item) => item.source === "legacy")
                      ? " · Includes earlier Frost Trash items"
                      : ""}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !trash.length || !!busy || trashLoading || !!trashError
                    }
                    onClick={() => {
                      setPurgeError("");
                      setPurgeItems([...trash]);
                    }}
                  >
                    <Trash2 size={14} />
                    Empty Trash
                  </Button>
                </div>
                {trashError ? (
                  <div className="error-state">
                    <CircleAlert size={30} />
                    <h2>Trash could not be loaded</h2>
                    <p>{trashError}</p>
                    <Button variant="outline" onClick={() => void loadTrash()}>
                      Try again
                    </Button>
                  </div>
                ) : trashLoading ? (
                  <div className="preview-loading">
                    <LoaderCircle className="spin" />
                    Loading Trash
                  </div>
                ) : !trash.length ? (
                  <div className="empty-state">
                    <Trash2 size={36} strokeWidth={1.25} />
                    <h2>Nothing in Trash</h2>
                    <p>Files you remove in Frost will appear here.</p>
                  </div>
                ) : (
                  <div className="trash-list">
                    {trash.map((item) => (
                      <div className="trash-row" key={item.id}>
                        <div className="trash-file-icon">
                          <FileText size={22} />
                        </div>
                        <div>
                          <strong>{item.name}</strong>
                          <span title={item.originalPath}>
                            {item.originalPath}
                          </span>
                        </div>
                        <time>{formatDate(item.trashedAt)}</time>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!!busy}
                          onClick={() => void restoreItems([item.id])}
                        >
                          <Undo2 size={14} />
                          Restore
                        </Button>
                        <Tip label="Delete permanently">
                          <Button
                            size="icon"
                            aria-label={`Delete ${item.name} permanently`}
                            disabled={!!busy}
                            onClick={() => {
                              setPurgeError("");
                              setPurgeItems([item]);
                            }}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </Tip>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <>
                {error ? (
                  <div className="error-state">
                    <CircleAlert size={34} strokeWidth={1.25} />
                    <h2>This folder could not be opened</h2>
                    <p>{error}</p>
                    <code>{path}</code>
                    <div>
                      <Button variant="outline" onClick={refresh}>
                        <RefreshCw size={15} />
                        Try again
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => go(session.root)}
                      >
                        <House size={15} />
                        Go home
                      </Button>
                    </div>
                  </div>
                ) : (
                  <FileBrowser
                    key={listing?.path || path}
                    files={visible}
                    view={view}
                    selected={selected}
                    cutPaths={cutPaths}
                    busy={!!busy}
                    loading={loading}
                    query={query}
                    sort={sort}
                    direction={direction}
                    onSort={onSort}
                    onSelect={select}
                    onOpen={open}
                    onAction={handleAction}
                    onNew={() => beginEdit("folder")}
                    onClearFilter={() => setQuery("")}
                    onClearSelection={() => setSelected(new Set())}
                    onSelectMany={setSelected}
                    readOnly={listing?.readOnly ?? true}
                    onPaste={() => void paste()}
                    canPaste={!!clipboard}
                    hidden={hidden}
                    onToggleHidden={() => setHidden(!hidden)}
                    onViewChange={setView}
                    onTogglePreview={() => setPreview(!preview)}
                    previewOpen={preview}
                  />
                )}
                {preview && (
                  <aside
                    className="preview-aside"
                    style={{ width: previewWidth }}
                  >
                    <div
                      className="resize-handle"
                      role="separator"
                      aria-label="Resize preview"
                      aria-orientation="vertical"
                      aria-valuemin={240}
                      aria-valuemax={520}
                      aria-valuenow={previewWidth}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft")
                          setPreviewWidth((w) => Math.min(520, w + 20));
                        if (event.key === "ArrowRight")
                          setPreviewWidth((w) => Math.max(240, w - 20));
                      }}
                      onPointerDown={(event) => {
                        const startX = event.clientX,
                          startWidth = previewWidth;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const node = event.currentTarget;
                        const move = (e: PointerEvent) =>
                          setPreviewWidth(
                            Math.max(
                              240,
                              Math.min(520, startWidth + startX - e.clientX),
                            ),
                          );
                        const end = () => {
                          node.removeEventListener("pointermove", move);
                          node.removeEventListener("pointerup", end);
                          node.removeEventListener("pointercancel", end);
                        };
                        node.addEventListener("pointermove", move);
                        node.addEventListener("pointerup", end);
                        node.addEventListener("pointercancel", end);
                      }}
                    />
                    <Preview
                      file={focusedFile}
                      selectionCount={selected.size}
                      onClose={() => setPreview(false)}
                      onExpand={() => focusedFile && setQuickLook(focusedFile)}
                      onOpen={go}
                      onCopyPath={copyPath}
                    />
                  </aside>
                )}
              </>
            )}
          </div>
          <footer className="statusbar">
            <span className="status-folder" title={currentPath}>
              {title}
              {!showTrash && listing?.readOnly && (
                <span className="readonly-label">
                  <LockKeyhole size={10} />
                  Read-only
                </span>
              )}
            </span>
            <span className="status-count" aria-live="polite">
              {busy ? (
                <>
                  <LoaderCircle size={11} className="spin" />
                  {busy}…
                </>
              ) : showTrash ? (
                `${trash.length} items`
              ) : selected.size ? (
                `${selected.size} of ${visible.length.toLocaleString()} selected`
              ) : (
                `${visible.length.toLocaleString()} ${visible.length === 1 ? "item" : "items"}${query ? ` of ${listing?.entries.length || 0}` : ""}`
              )}
            </span>
          </footer>
        </main>
      </div>
      <Dialog
        open={!!editDialog}
        onOpenChange={(value) => {
          if (!value && !busy) setEditDialog(null);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>
            {editDialog?.type === "trash"
              ? `${editDialog.files.length === 1 ? `“${editDialog.files[0].name}”` : `${editDialog.files.length} items`} will move to system Trash. You can restore ${editDialog.files.length === 1 ? "it" : "them"} later.`
              : editDialog?.type === "move"
                ? "Enter the destination folder. Existing items are never replaced by this operation."
                : editDialog?.type === "rename"
                  ? "Choose a new name, including the file extension."
                  : `Create a folder inside ${shortenPath(currentPath, session.home)}.`}
          </DialogDescription>
          <form onSubmit={submitEdit}>
            {editDialog?.type !== "trash" && (
              <label className="dialog-field">
                {editDialog?.type === "move" ? "Destination path" : "Name"}
                <input
                  autoFocus
                  required
                  spellCheck={false}
                  value={editDialog?.value || ""}
                  disabled={!!busy}
                  placeholder={
                    editDialog?.type === "move"
                      ? "~/Documents"
                      : "Untitled folder"
                  }
                  onFocus={(event) => {
                    if (editDialog?.type === "rename") {
                      const dot = event.currentTarget.value.lastIndexOf(".");
                      event.currentTarget.setSelectionRange(
                        0,
                        dot > 0 ? dot : event.currentTarget.value.length,
                      );
                    }
                  }}
                  onChange={(event) =>
                    setEditDialog((old) =>
                      old ? { ...old, value: event.target.value } : null,
                    )
                  }
                />
              </label>
            )}
            {dialogError && (
              <p role="alert" className="form-error">
                {dialogError}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={() => setEditDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={editDialog?.type === "trash" ? "danger" : "default"}
                disabled={!!busy}
              >
                {busy && <LoaderCircle size={15} className="spin" />}
                {editDialog?.type === "folder"
                  ? "Create folder"
                  : editDialog?.type === "rename"
                    ? "Save name"
                    : editDialog?.type === "move"
                      ? "Move items"
                      : "Move to Trash"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!purgeItems}
        onOpenChange={(open) => {
          if (!open && !busy) setPurgeItems(null);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogTitle>
            {purgeItems?.length === 1 ? "Delete permanently?" : "Empty Trash?"}
          </DialogTitle>
          <DialogDescription>
            {purgeItems?.length === 1
              ? purgeItems[0].name
              : `${purgeItems?.length ?? 0} items will be permanently deleted.`}{" "}
            This cannot be undone.
          </DialogDescription>
          {purgeError && (
            <p className="form-error" role="alert">
              {purgeError}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => setPurgeItems(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!!busy}
              onClick={() => void purgeTrash()}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {changeKey && <ChangeKey onClose={() => setChangeKey(false)} />}
      {findOpen && (
        <FindPanel
          path={currentPath}
          hidden={hidden}
          onClose={() => setFindOpen(false)}
          onOpen={(result) => {
            setFindOpen(false);
            if (result.file.kind === "folder") go(result.file.path);
            else {
              setFindLine(
                result.line
                  ? { path: result.file.path, line: result.line }
                  : null,
              );
              setQuickLook(result.file);
            }
          }}
        />
      )}
      <QuickView
        file={quickLook}
        line={findLine?.path === quickLook?.path ? findLine?.line : undefined}
        files={visible.filter((file) => file.kind !== "folder")}
        onChange={(file) => {
          setFindLine(null);
          setQuickLook(file);
        }}
        onOpen={go}
        onCopyPath={copyPath}
      />
      <Dialog open={shortcuts} onOpenChange={setShortcuts}>
        <DialogContent>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Navigation and file actions.</DialogDescription>
          <dl className="shortcut-list">
            {[
              ["Edit path", "/"],
              ["Filter folder", "F"],
              ["Find names or contents", "Ctrl / ⌘ K"],
              ["Toggle Quick View / open folder", "Space"],
              ["Rename selected item", "F2"],
              ["Show hidden files", "Ctrl / ⌘ Shift ."],
              ["Select all visible files", "Ctrl / ⌘ A"],
              ["Copy / cut", "Ctrl / ⌘ C / X"],
              ["Paste", "Ctrl / ⌘ V"],
              ["Move selection to Trash", "Delete"],
              ["Extend selection", "Shift + click"],
              ["Add to selection", "Ctrl / ⌘ + click"],
              ["Close preview / clear selection", "Esc"],
            ].map(([label, key]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <kbd>{key}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
      <Toaster
        theme={effectiveTheme}
        position="bottom-right"
        offset={{ bottom: 40, right: 20 }}
        visibleToasts={3}
      />
    </TooltipProvider>
  );
}
