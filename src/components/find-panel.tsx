import { useEffect, useRef, useState } from "react";
import { Folder, Info, LoaderCircle, Search, Square } from "lucide-react";
import type { FindResponse, FindResult } from "../../shared/types";
import { api } from "@/lib/api";
import { shortenPath } from "@/lib/utils";
import { Tip } from "./ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { FileIcon } from "./file-icon";

export function FindPanel({
  path,
  home,
  hidden,
  onClose,
  onOpen,
}: {
  path: string;
  home: string;
  hidden: boolean;
  onClose: () => void;
  onOpen: (result: FindResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"names" | "contents">("names");
  const [recursive, setRecursive] = useState(false);
  const [data, setData] = useState<FindResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [active, setActive] = useState(0);
  const request = useRef<AbortController | null>(null);
  const results = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setData(null);
    setError("");
    setActive(0);
    setCancelled(false);
    if (!query.trim()) {
      setBusy(false);
      return () => controller.abort();
    }
    setBusy(true);
    const timer = window.setTimeout(() => {
      api
        .find(path, query, mode, recursive, hidden, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setData(value);
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(error.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, query, mode, recursive, hidden]);
  useEffect(() => {
    results.current
      ?.querySelector(`[data-result="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const items = data?.results ?? [];
  const hasQuery = !!query.trim();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="find-dialog"
        overlayClassName="find-overlay"
        showCloseButton={false}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">Find files</DialogTitle>
        <DialogDescription className="sr-only">
          Search names or file contents in {path}. Use arrow keys to select a
          result and Enter to open it.
        </DialogDescription>
        <div className="find-input">
          <Search size={16} strokeWidth={1.6} />
          <input
            type="search"
            autoFocus
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            aria-label={
              mode === "names" ? "Find filenames" : "Find text in files"
            }
            placeholder={
              mode === "names" ? "Find files" : "Find in file contents"
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={items.length > 0}
            aria-controls="find-results"
            aria-activedescendant={
              items[active] ? `find-result-${active}` : undefined
            }
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive((old) =>
                  Math.max(
                    0,
                    Math.min(
                      items.length - 1,
                      old + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
              } else if (event.key === "Enter" && items[active]) {
                event.preventDefault();
                onOpen(items[active]);
              }
            }}
          />
          <div className="find-mode" aria-label="Search mode">
            <button
              aria-pressed={mode === "names"}
              onClick={() => setMode("names")}
            >
              Names
            </button>
            <button
              aria-pressed={mode === "contents"}
              onClick={() => setMode("contents")}
            >
              Contents
            </button>
          </div>
          {busy && (
            <button
              className="find-cancel"
              aria-label="Cancel search"
              title="Cancel search"
              onClick={() => {
                request.current?.abort();
                setBusy(false);
                setCancelled(true);
              }}
            >
              <Square size={12} />
            </button>
          )}
          <button
            className="find-dismiss"
            aria-label="Close Find"
            onClick={onClose}
          >
            <kbd>esc</kbd>
          </button>
        </div>
        <div className="find-options">
          <div
            className="find-scope"
            title={path}
            aria-label={`Search in ${path}`}
          >
            <Folder size={12} />
            <span>{shortenPath(path, home)}</span>
          </div>
          <label>
            <input
              type="checkbox"
              checked={recursive}
              onChange={(event) => setRecursive(event.target.checked)}
            />
            Subfolders
          </label>
        </div>
        <div
          className="find-results"
          ref={results}
          id="find-results"
          role="listbox"
          aria-label="Search results"
          aria-busy={busy}
        >
          {items.map((item, index) => (
            <button
              id={`find-result-${index}`}
              key={`${item.file.path}:${item.line ?? ""}`}
              data-result={index}
              role="option"
              aria-selected={index === active}
              tabIndex={-1}
              className={index === active ? "is-active" : ""}
              onMouseMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onOpen(item)}
            >
              <FileIcon kind={item.file.kind} size={16} />
              <span className="find-result-text">
                <span className="find-result-title">
                  <span title={item.file.name}>{item.file.name}</span>
                  {item.line && <small>Line {item.line}</small>}
                </span>
                {item.relativePath.includes("/") && (
                  <span className="find-result-path" title={item.relativePath}>
                    {item.relativePath.slice(
                      0,
                      item.relativePath.lastIndexOf("/"),
                    )}
                  </span>
                )}
                {item.snippet && (
                  <span className="find-snippet">{item.snippet}</span>
                )}
              </span>
            </button>
          ))}
        </div>
        {hasQuery && !items.length && (
          <p className="find-message" role="status">
            {busy ? (
              <>
                <LoaderCircle className="spin" size={15} />
                Searching…
              </>
            ) : (
              error || (cancelled ? "Search cancelled." : "No matches.")
            )}
          </p>
        )}
        {data && (
          <span className="sr-only" role="status">
            {items.length} matches
          </span>
        )}
        {data && (data.limited || data.skipped > 0) && (
          <div className="find-status">
            <Tip
              label={[
                data.limited
                  ? "The search reached its time, scan, or result limit. Narrow the scope to see more."
                  : "",
                data.skipped
                  ? `${data.skipped} files or folders could not be fully searched.`
                  : "",
                mode === "contents"
                  ? "Contents search reads up to 256 KB and returns up to five lines per file."
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span tabIndex={0} className="find-partial">
                <Info size={12} />
                Partial results
              </span>
            </Tip>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
