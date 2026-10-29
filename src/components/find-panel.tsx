import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, Square } from "lucide-react";
import type { FindResponse, FindResult } from "../../shared/types";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { FileIcon } from "./file-icon";

export function FindPanel({
  path,
  hidden,
  onClose,
  onOpen,
}: {
  path: string;
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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="find-dialog"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onKeyDown={(event) => {
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
          } else if (
            event.key === "Enter" &&
            items[active] &&
            (event.target as HTMLElement).matches('input[type=search], [role="option"]')
          ) {
            event.preventDefault();
            onOpen(items[active]);
          }
        }}
      >
        <DialogTitle>Find</DialogTitle>
        <DialogDescription className="find-scope" title={path}>
          {path}
        </DialogDescription>
        <div className="find-input">
          <Search size={16} />
          <input
            type="search"
            autoFocus
            maxLength={200}
            aria-label={
              mode === "names" ? "Find filenames" : "Find text in files"
            }
            placeholder={
              mode === "names" ? "Find filenames…" : "Find text in files…"
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
          />
          {busy && (
            <button
              aria-label="Cancel search"
              title="Cancel search"
              onClick={() => {
                request.current?.abort();
                setBusy(false);
                setCancelled(true);
              }}
            >
              <Square size={13} />
            </button>
          )}
        </div>
        <div className="find-options">
          <div className="view-switch" aria-label="Search mode">
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
          <label>
            <input
              type="checkbox"
              checked={recursive}
              onChange={(event) => setRecursive(event.target.checked)}
            />
            Include subfolders
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
              className={index === active ? "is-active" : ""}
              onFocus={() => setActive(index)}
              onClick={() => onOpen(item)}
            >
              <FileIcon kind={item.file.kind} size={18} />
              <span className="find-result-text">
                <span className="find-result-title">
                  {item.file.name}
                  {item.line && <small>Line {item.line}</small>}
                </span>
                <span className="find-result-path" title={item.relativePath}>
                  {item.relativePath}
                </span>
                {item.snippet && (
                  <span className="find-snippet">{item.snippet}</span>
                )}
              </span>
            </button>
          ))}
          {!items.length && (
            <p className="find-message" role="status">
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={16} />
                  Searching…
                </>
              ) : (
                error ||
                (cancelled
                  ? "Search cancelled."
                  : query.trim()
                    ? "No matches."
                    : mode === "names"
                      ? "Find by filename, even with letters missing."
                      : "Search for a word or phrase inside text files.")
              )}
            </p>
          )}
        </div>
        <div className="find-status" role="status">
          {data && (
            <span>
              {items.length} {items.length === 1 ? "match" : "matches"}
              {data.limited ? " · Partial results; narrow the search" : ""}
              {data.skipped
                ? ` · ${data.skipped} files or folders skipped or partly read`
                : ""}
            </span>
          )}
          {mode === "contents" && (
            <span>Text files · first 256 KB · up to 5 lines per file</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
