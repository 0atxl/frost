import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as Context from "@radix-ui/react-context-menu";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  SquareArrowOutUpRight,
  FolderOpen,
  Link2,
  Scissors,
  Pencil,
  ScanEye,
  Trash2,
  MoveRight,
  Link,
  SearchX,
  FolderPlus,
  CircleAlert,
  Info,
  Clipboard,
  Eye,
  LayoutGrid,
  List,
  Star,
} from "lucide-react";
import type { FileEntry } from "../../shared/types";
import { thumbnailUrl } from "@/lib/api";
import { CachedThumbnail } from "./cached-thumbnail";
import { fileType, formatDate, formatSize, type SortBy } from "@/lib/utils";
import { FileIcon } from "./file-icon";
import { OpenWithSubmenu } from "./open-with";
import { Button } from "./ui/button";

export type FileAction =
  | "open"
  | "preview"
  | "info"
  | "rename"
  | "copy"
  | "cut"
  | "move"
  | "copy-path"
  | "pin"
  | "new-tab"
  | "external"
  | "open-with"
  | "trash";
const actions: {
  id: FileAction;
  label: string;
  icon: typeof Copy;
  shortcut?: string;
}[] = [
  { id: "open", label: "Open folder", icon: FolderOpen },
  {
    id: "new-tab",
    label: "Open folder in new tab",
    icon: SquareArrowOutUpRight,
  },
  { id: "pin", label: "Pin folder", icon: Star },
  { id: "external", label: "Open in default app", icon: ExternalLink },
  { id: "open-with", label: "Open with…", icon: ExternalLink },
  { id: "preview", label: "Quick look", icon: ScanEye, shortcut: "Space" },
  { id: "info", label: "Get info", icon: Info },
  { id: "rename", label: "Rename", icon: Pencil, shortcut: "F2" },
  { id: "copy", label: "Copy", icon: Copy, shortcut: "Ctrl C" },
  { id: "cut", label: "Cut", icon: Scissors, shortcut: "Ctrl X" },
  { id: "move", label: "Move to…", icon: MoveRight },
  { id: "copy-path", label: "Copy path", icon: Link2 },
  { id: "trash", label: "Move to Trash", icon: Trash2, shortcut: "Del" },
];
export function fileActionsFor(file: FileEntry | undefined, count: number) {
  return actions.filter((action) =>
    action.id === "open" || action.id === "new-tab" || action.id === "pin"
      ? count === 1 && file?.kind === "folder"
      : action.id === "preview" ||
          action.id === "external" ||
          action.id === "open-with"
        ? count === 1 && file?.kind !== "folder"
        : action.id === "rename" || action.id === "info"
          ? count === 1
          : true,
  );
}
export function fileActionDisabled(action: FileAction, files: FileEntry[]) {
  return ["rename", "cut", "move", "trash"].includes(action)
    ? files.some((file) => !file.writable)
    : ["open", "new-tab", "preview", "external", "open-with"].includes(
        action,
      ) && files.some((file) => !file.accessible);
}
function Thumbnail({ file }: { file: FileEntry }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [file.path, file.modified]);
  return (
    <div className={`thumbnail thumbnail-${file.kind}`}>
      {file.kind === "image" && file.accessible && file.extension !== "svg" ? (
        <CachedThumbnail file={file} />
      ) : file.kind === "image" && !failed && file.accessible ? (
        <img
          src={thumbnailUrl(file)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <FileIcon kind={file.kind} size={52} />
        </>
      )}
      {file.isSymlink && (
        <span
          className="symlink-badge"
          aria-label="Symbolic link"
          title="Symbolic link"
        >
          <Link size={12} />
        </span>
      )}
      {!file.accessible && (
        <span className="unavailable-badge" aria-label="Unavailable">
          <CircleAlert size={13} />
        </span>
      )}
    </div>
  );
}
interface Props {
  files: FileEntry[];
  view: "grid" | "list";
  selected: Set<string>;
  cutPaths: Set<string>;
  busy: boolean;
  loading: boolean;
  query: string;
  sort: SortBy;
  direction: "asc" | "desc";
  onSort: (sort: SortBy) => void;
  onSelect: (
    file: FileEntry,
    event: Pick<MouseEvent, "shiftKey" | "metaKey" | "ctrlKey">,
  ) => void;
  onOpen: (file: FileEntry) => void;
  onAction: (action: FileAction, files?: FileEntry[]) => void;
  onNew: () => void;
  onClearFilter: () => void;
  onClearSelection: () => void;
  onPaste: () => void;
  canPaste: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  onViewChange: (view: "list" | "grid") => void;
  onTogglePreview: () => void;
  previewOpen: boolean;
  readOnly: boolean;
  onSelectMany: (paths: Set<string>) => void;
  isPinned: (path: string) => boolean;
  currentPath: string;
  onPinCurrent: () => void;
}
export function FileBrowser({
  files,
  view,
  selected,
  cutPaths,
  busy,
  loading,
  query,
  sort,
  direction,
  onSort,
  onSelect,
  onOpen,
  onAction,
  onNew,
  onClearFilter,
  onClearSelection,
  onPaste,
  canPaste,
  hidden,
  onToggleHidden,
  onViewChange,
  onTogglePreview,
  previewOpen,
  readOnly,
  onSelectMany,
  isPinned,
  currentPath,
  onPinCurrent,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const columns =
    view === "list" ? 1 : Math.max(1, Math.floor((width - 24) / 104));
  const virtualizer = useVirtualizer({
    count: Math.ceil(files.length / columns),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (view === "grid" ? 116 : 24),
    overscan: 4,
  });
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    virtualizer.measure();
  }, [view, columns, virtualizer]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [query]);
  function keyDown(event: KeyboardEvent, file: FileEntry, index: number) {
    let next = index;
    if (event.key === "ArrowRight" && view === "grid") next++;
    else if (event.key === "ArrowLeft" && view === "grid") next--;
    else if (event.key === "ArrowDown") next += columns;
    else if (event.key === "ArrowUp") next -= columns;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = files.length - 1;
    else if (event.key === "Enter") {
      event.preventDefault();
      onOpen(file);
      return;
    } else return;
    event.preventDefault();
    next = Math.min(files.length - 1, Math.max(0, next));
    onSelect(files[next], {
      shiftKey: event.shiftKey,
      metaKey: false,
      ctrlKey: false,
    });
    virtualizer.scrollToIndex(Math.floor(next / columns), { align: "auto" });
    requestAnimationFrame(() =>
      scrollRef.current
        ?.querySelector<HTMLButtonElement>(`[data-file-index="${next}"]`)
        ?.focus(),
    );
  }
  const rectangle = useRef<HTMLDivElement>(null);
  const lastDragSelection = useRef<Set<string>>(new Set());
  const dirty = useRef(false);
  const [contextFiles, setContextFiles] = useState<FileEntry[]>([]);
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    base: Set<string>;
    active: boolean;
    initial: Set<string>;
  } | null>(null);
  const frame = useRef(0),
    suppressClick = useRef(false);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  function updateDrag() {
    const state = drag.current,
      element = scrollRef.current;
    if (!state || !element) return;
    const bounds = element.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(element.clientWidth, state.clientX - bounds.left),
    );
    const y = Math.max(
      0,
      Math.min(
        Math.max(
          element.clientHeight,
          virtualizer.getTotalSize() + (view === "grid" ? 12 : 4),
        ),
        state.clientY - bounds.top + element.scrollTop,
      ),
    );
    if (!state.active && Math.hypot(x - state.x, y - state.y) < 4) return;
    state.active = true;
    const next = {
      x: Math.min(x, state.x),
      y: Math.min(y, state.y),
      width: Math.abs(x - state.x),
      height: Math.abs(y - state.y),
    };
    if (rectangle.current) {
      const style = rectangle.current.style;
      style.display = "block";
      style.left = `${next.x}px`;
      style.top = `${next.y}px`;
      style.width = `${next.width}px`;
      style.height = `${next.height}px`;
    }
    const chosen = new Set(state.base);
    const rowHeight = view === "grid" ? 116 : 24;
    const top = view === "grid" ? 12 : 4;
    const padding = view === "grid" ? 12 : 6;
    const gap = view === "grid" ? 8 : 0;
    const itemWidth =
      (element.clientWidth - padding * 2 - gap * (columns - 1)) / columns;
    const first = Math.max(0, Math.floor((next.y - top) / rowHeight));
    const last = Math.min(
      Math.ceil(files.length / columns) - 1,
      Math.floor((next.y + next.height - top) / rowHeight),
    );
    for (let row = first; row <= last; row++) {
      for (let column = 0; column < columns; column++) {
        const file = files[row * columns + column];
        if (!file) break;
        const left = padding + column * (itemWidth + gap),
          itemTop = top + row * rowHeight;
        if (
          left < next.x + next.width &&
          left + itemWidth > next.x &&
          itemTop < next.y + next.height &&
          itemTop + rowHeight - (view === "grid" ? 12 : 0) > next.y
        )
          chosen.add(file.path);
      }
    }
    const previous = lastDragSelection.current;
    if (
      previous.size !== chosen.size ||
      [...chosen].some((path) => !previous.has(path))
    ) {
      lastDragSelection.current = chosen;
      onSelectMany(chosen);
    }
  }
  function scrollDrag() {
    const element = scrollRef.current,
      state = drag.current;
    if (!element || !state) return;
    const bounds = element.getBoundingClientRect();
    const delta =
      state.clientY < bounds.top + 28
        ? -Math.min(18, (bounds.top + 28 - state.clientY) / 2)
        : state.clientY > bounds.bottom - 28
          ? Math.min(18, (state.clientY - bounds.bottom + 28) / 2)
          : 0;
    if (delta && state.active) {
      const previous = element.scrollTop;
      element.scrollTop += delta;
      if (element.scrollTop !== previous) dirty.current = true;
    }
    if (dirty.current) {
      dirty.current = false;
      updateDrag();
    }
    frame.current = requestAnimationFrame(scrollDrag);
  }
  function endDrag(cancelled = false) {
    const state = drag.current;
    if (!state) return;
    if (!cancelled && dirty.current) updateDrag();
    if (cancelled) onSelectMany(state.initial);
    suppressClick.current = state.active;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    if (rectangle.current) rectangle.current.style.display = "none";
    dirty.current = false;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }
  const selectedFiles = files.filter((file) => selected.has(file.path));
  function renderFile(file: FileEntry, index: number) {
    const isSelected = selected.has(file.path);
    return (
      <div
        key={file.path}
        data-file-path={file.path}
        className={`file-item ${view === "grid" ? "file-tile" : "file-row"} ${isSelected ? "is-selected" : ""} ${index % 2 === 0 ? "even-row" : ""} ${cutPaths.has(file.path) ? "is-cut" : ""}`}
      >
        <button
          className="file-select"
          data-file-index={index}
          tabIndex={
            selected.size ? (isSelected ? 0 : -1) : index === 0 ? 0 : -1
          }
          aria-label={file.name}
          aria-pressed={isSelected}
          onClick={(event) => onSelect(file, event)}
          onDoubleClick={() => onOpen(file)}
          onKeyDown={(event) => keyDown(event, file, index)}
          disabled={busy}
        >
          {view === "grid" ? (
            <>
              <Thumbnail file={file} />
              <div className="file-caption">
                <span className="file-name" title={file.name}>
                  {file.name}
                </span>
              </div>
            </>
          ) : (
            <>
              <span className="row-name">
                <FileIcon kind={file.kind} size={16} />
                <span title={file.name}>{file.name}</span>
                {file.isSymlink && (
                  <span title="Symbolic link" aria-label="Symbolic link">
                    <Link size={12} />
                  </span>
                )}
              </span>
              <span className="row-modified">{formatDate(file.modified)}</span>
              <span className="row-size">
                {file.kind === "folder" ? "—" : formatSize(file.size)}
              </span>
              <span className="row-type">{fileType(file)}</span>
            </>
          )}
        </button>
      </div>
    );
  }
  return (
    <Context.Root>
      <Context.Trigger asChild>
        <section
          className="file-browser"
          aria-label="Files"
          onContextMenu={(event) => {
            const location = (event.target as HTMLElement).closest<HTMLElement>(
              "[data-file-path]",
            )?.dataset.filePath;
            const file = files.find((item) => item.path === location);
            if (!file) {
              setContextFiles([]);
              return;
            }
            const chosen = selected.has(file.path) ? selectedFiles : [file];
            setContextFiles(chosen);
            if (!selected.has(file.path))
              onSelect(file, {
                shiftKey: false,
                ctrlKey: false,
                metaKey: false,
              });
          }}
          onKeyDownCapture={(event) => {
            if (event.key === "Escape" && drag.current) {
              event.preventDefault();
              event.stopPropagation();
              endDrag(true);
            }
          }}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || !files.length) return;
            if (
              [
                "ArrowDown",
                "ArrowUp",
                "ArrowRight",
                "ArrowLeft",
                "Home",
                "End",
              ].includes(event.key)
            ) {
              event.preventDefault();
              const index = event.key === "End" ? files.length - 1 : 0;
              onSelect(files[index], {
                shiftKey: false,
                ctrlKey: false,
                metaKey: false,
              });
              virtualizer.scrollToIndex(Math.floor(index / columns));
              requestAnimationFrame(() =>
                scrollRef.current
                  ?.querySelector<HTMLButtonElement>(
                    `[data-file-index="${index}"]`,
                  )
                  ?.focus(),
              );
            }
          }}
        >
          {view === "list" && (
            <div className="list-heading">
              {(["name", "modified", "size", "type"] as SortBy[]).map(
                (column) => (
                  <button
                    key={column}
                    className={`heading-${column}`}
                    onClick={() => onSort(column)}
                  >
                    {
                      {
                        name: "Name",
                        modified: "Date Modified",
                        size: "Size",
                        type: "Kind",
                      }[column]
                    }
                    {sort === column &&
                      (direction === "asc" ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      ))}
                  </button>
                ),
              )}
            </div>
          )}
          <div
            className="file-scroll"
            ref={scrollRef}
            onPointerDown={(event) => {
              if (
                event.button !== 0 ||
                event.pointerType === "touch" ||
                busy ||
                loading ||
                (event.target as HTMLElement).closest(
                  "button,a,input,.file-item",
                )
              )
                return;
              const bounds = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX - bounds.left >=
                event.currentTarget.clientWidth
              )
                return;
              event.preventDefault();
              event.currentTarget
                .closest<HTMLElement>(".file-browser")
                ?.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                pointer: event.pointerId,
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top + event.currentTarget.scrollTop,
                clientX: event.clientX,
                clientY: event.clientY,
                base:
                  event.ctrlKey || event.metaKey || event.shiftKey
                    ? new Set(selected)
                    : new Set(),
                initial: new Set(selected),
                active: false,
              };
              lastDragSelection.current = new Set(selected);
              dirty.current = false;
              frame.current = requestAnimationFrame(scrollDrag);
            }}
            onPointerMove={(event) => {
              if (drag.current?.pointer !== event.pointerId) return;
              drag.current.clientX = event.clientX;
              drag.current.clientY = event.clientY;
              dirty.current = true;
            }}
            onPointerUp={() => endDrag()}
            onPointerCancel={() => endDrag(true)}
            onLostPointerCapture={() => {
              if (drag.current) endDrag(true);
            }}
            onClickCapture={(event) => {
              if (suppressClick.current) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) onClearSelection();
            }}
          >
            <div
              ref={rectangle}
              className="selection-rectangle"
              aria-hidden="true"
              style={{ display: "none" }}
            />
            {loading && files.length === 0 ? (
              <div className="skeleton-grid">
                {Array.from({ length: 12 }, (_, i) => (
                  <div className="file-skeleton" key={i}>
                    <div />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : files.length === 0 ? (
              <div className="empty-state">
                {query ? (
                  <SearchX size={36} strokeWidth={1.25} />
                ) : (
                  <FolderOpen size={42} strokeWidth={1.25} />
                )}
                <h2>{query ? "No matching files" : "Empty folder"}</h2>
                <p>
                  {query
                    ? `No filenames match “${query}” in this folder.`
                    : "No items."}
                </p>
                {query ? (
                  <Button variant="outline" onClick={onClearFilter}>
                    Clear filter
                  </Button>
                ) : (
                  <Button variant="outline" onClick={onNew} disabled={readOnly}>
                    <FolderPlus size={16} />
                    New folder
                  </Button>
                )}
              </div>
            ) : (
              <div
                className={`virtual-files virtual-${view}`}
                style={{ height: virtualizer.getTotalSize() }}
                onClick={(event) => {
                  if (event.target === event.currentTarget) onClearSelection();
                }}
              >
                {virtualizer.getVirtualItems().map((row) => (
                  <div
                    className="virtual-row"
                    onClick={(event) => {
                      if (event.target === event.currentTarget)
                        onClearSelection();
                    }}
                    key={row.key}
                    style={{
                      transform: `translateY(${row.start}px)`,
                      height: row.size,
                      gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
                    }}
                  >
                    {files
                      .slice(row.index * columns, (row.index + 1) * columns)
                      .map((file, index) =>
                        renderFile(file, row.index * columns + index),
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </Context.Trigger>
      <Context.Portal>
        <Context.Content
          className="menu"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              if (!document.querySelector('[role="dialog"]'))
                scrollRef.current
                  ?.closest<HTMLElement>(".file-browser")
                  ?.focus();
            });
          }}
        >
          {contextFiles.length ? (
            fileActionsFor(contextFiles[0], contextFiles.length).map(
              ({ id, label, icon: Icon, shortcut }) =>
                id === "open-with" ? (
                  <OpenWithSubmenu
                    key={id}
                    file={contextFiles[0]}
                    kind="context"
                    disabled={busy || fileActionDisabled(id, contextFiles)}
                  />
                ) : (
                  <Context.Item
                    key={id}
                    className={`menu-item ${id === "trash" ? "menu-danger" : ""}`}
                    disabled={busy || fileActionDisabled(id, contextFiles)}
                    onSelect={() => onAction(id, contextFiles)}
                  >
                    <Icon size={15} />
                    <span>
                      {id === "pin" && isPinned(contextFiles[0].path)
                        ? "Unpin folder"
                        : label}
                    </span>
                    {shortcut && <span className="menu-key">{shortcut}</span>}
                  </Context.Item>
                ),
            )
          ) : (
            <>
              <Context.Item
                className="menu-item"
                disabled={busy || readOnly}
                onSelect={onNew}
              >
                <FolderPlus size={15} />
                <span>New folder</span>
              </Context.Item>
              <Context.Item
                className="menu-item"
                disabled={busy || readOnly || !canPaste}
                onSelect={onPaste}
              >
                <Clipboard size={15} />
                <span>Paste</span>
                <span className="menu-key">Ctrl V</span>
              </Context.Item>
              <Context.Item
                className="menu-item"
                onSelect={onPinCurrent}
                disabled={loading}
              >
                <Star size={15} />
                <span>
                  {isPinned(currentPath) ? "Unpin folder" : "Pin folder"}
                </span>
              </Context.Item>
              <Context.Separator className="menu-separator" />
              <Context.Item
                className="menu-item"
                onSelect={() => onViewChange(view === "list" ? "grid" : "list")}
              >
                {view === "list" ? (
                  <LayoutGrid size={15} />
                ) : (
                  <List size={15} />
                )}
                <span>
                  {view === "list" ? "View as icons" : "View as list"}
                </span>
              </Context.Item>
              <Context.Item className="menu-item" onSelect={onTogglePreview}>
                <Info size={15} />
                <span>{previewOpen ? "Hide inspector" : "Show inspector"}</span>
              </Context.Item>
              <Context.CheckboxItem
                className="menu-item"
                checked={hidden}
                onCheckedChange={onToggleHidden}
              >
                <Eye size={15} />
                <span>Show hidden files</span>
                <Context.ItemIndicator>
                  <Check size={14} />
                </Context.ItemIndicator>
              </Context.CheckboxItem>
            </>
          )}
        </Context.Content>
      </Context.Portal>
    </Context.Root>
  );
}
