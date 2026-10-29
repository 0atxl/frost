import { lazy, Suspense, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Link2,
  LoaderCircle,
  Maximize2,
  Music2,
  X,
} from "lucide-react";
import type { FileEntry } from "../../shared/types";
import { fileUrl } from "@/lib/api";
import { fileType, formatDate, formatSize } from "@/lib/utils";
import { Button } from "./ui/button";
import { Tip } from "./ui/tooltip";
import { FileIcon } from "./file-icon";
import { OpenWithButton } from "./open-with";
const PdfPreview = lazy(() => import("./pdf-preview"));
const TextContent = lazy(() => import("./text-preview"));

function Content({
  file,
  onOpen,
  compact = false,
  onMediaSize,
  line,
}: {
  line?: number;
  onMediaSize?: (width: number, height: number) => void;
  compact?: boolean;
  file: FileEntry;
  onOpen: (path: string) => void;
}) {
  const [failed, setFailed] = useState(false),
    [asText, setAsText] = useState(false);
  useEffect(() => {
    setFailed(false);
    setAsText(false);
  }, [file.path, file.modified]);
  if (!file.accessible)
    return (
      <div className="unsupported">
        <FileIcon kind="unknown" size={44} />
        <strong>This item is unavailable</strong>
        <p>
          It may be a broken link or point outside the folders Frost can access.
        </p>
      </div>
    );
  if (file.kind === "folder")
    return (
      <div className="folder-preview">
        <FileIcon kind="folder" size={80} />
        <Button variant="outline" onClick={() => onOpen(file.path)}>
          Open folder
        </Button>
      </div>
    );
  if (file.kind === "image" && !failed)
    return (
      <div className="image-preview">
        <img
          src={fileUrl(file)}
          alt={file.name}
          onLoad={(event) =>
            onMediaSize?.(
              event.currentTarget.naturalWidth,
              event.currentTarget.naturalHeight,
            )
          }
          onError={() => setFailed(true)}
        />
      </div>
    );
  if (file.kind === "pdf")
    return (
      <Suspense
        fallback={
          <div className="preview-loading">
            <LoaderCircle className="spin" />
            Loading PDF
          </div>
        }
      >
        <PdfPreview url={fileUrl(file)} compact={compact} />
      </Suspense>
    );
  if (file.kind === "video" && !failed)
    return (
      <div className="video-preview">
        <video
          controls
          preload="metadata"
          playsInline
          onLoadedMetadata={(event) =>
            onMediaSize?.(
              event.currentTarget.videoWidth,
              event.currentTarget.videoHeight,
            )
          }
          src={fileUrl(file)}
          onError={() => setFailed(true)}
        />
      </div>
    );
  if (file.kind === "audio" && !failed)
    return (
      <div className="audio-preview">
        <div className="audio-art">
          <Music2 size={50} strokeWidth={1} />
        </div>
        <audio
          controls
          preload="metadata"
          src={fileUrl(file)}
          onError={() => setFailed(true)}
        />
      </div>
    );
  if (file.kind === "text" || file.kind === "code" || asText || line)
    return (
      <Suspense
        fallback={
          <div className="preview-loading">
            <LoaderCircle className="spin" size={20} />
            Loading preview
          </div>
        }
      >
        <TextContent file={file} line={line} raw={!!line} />
      </Suspense>
    );
  return (
    <div className="unsupported">
      <div className="unsupported-icon">
        <FileIcon kind={file.kind} size={46} />
        {file.extension && <span>.{file.extension}</span>}
      </div>
      <strong>
        {failed ? "This format could not be displayed" : "Preview unavailable"}
      </strong>
      {failed && <p>Your browser may not support this format.</p>}
      <Button variant="outline" size="sm" onClick={() => setAsText(true)}>
        Try as text
      </Button>
    </div>
  );
}
export function FileDetails({ file }: { file: FileEntry }) {
  return (
    <dl className="file-details">
      <dt>Kind</dt>
      <dd>{fileType(file)}</dd>
      <dt>Size</dt>
      <dd>
        {file.kind === "folder" ? "Not calculated" : formatSize(file.size)}
      </dd>
      <dt>Modified</dt>
      <dd>{formatDate(file.modified, true)}</dd>
      <dt>Created</dt>
      <dd>{formatDate(file.created, true)}</dd>
      {file.isSymlink && (
        <>
          <dt>Link</dt>
          <dd>Symbolic link</dd>
        </>
      )}
      <dt>Location</dt>
      <dd className="detail-path">{file.path}</dd>
    </dl>
  );
}
export function Preview({
  file,
  onClose,
  onExpand,
  onOpen,
  onCopyPath,
  large = false,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  onMediaSize,
  onDetailsChange,
  selectionCount = 0,
  line,
}: {
  selectionCount?: number;
  line?: number;
  file: FileEntry | null;
  onClose?: () => void;
  onExpand?: () => void;
  onOpen: (path: string) => void;
  onCopyPath: (path: string) => void;
  large?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onMediaSize?: (width: number, height: number) => void;
  onDetailsChange?: (open: boolean) => void;
}) {
  const [details, setDetails] = useState(false);
  return (
    <section
      className={`preview-panel ${large ? "preview-large" : ""}`}
      aria-label={large ? "Quick look" : "Inspector"}
    >
      {large ? (
        <header className="quicklook-header">
          {file && (
            <>
              <FileIcon kind={file.kind} size={16} />
              <h3 title={file.name}>{file.name}</h3>
            </>
          )}
          <div className="preview-header-actions">
            <Tip label="Previous file">
              <Button
                size="icon"
                aria-label="Previous file"
                disabled={!hasPrevious}
                onClick={onPrevious}
              >
                <ChevronLeft />
              </Button>
            </Tip>
            <Tip label="Next file">
              <Button
                size="icon"
                aria-label="Next file"
                disabled={!hasNext}
                onClick={onNext}
              >
                <ChevronRight />
              </Button>
            </Tip>
            <span className="toolbar-divider" />
            <Tip label="File information">
              <Button
                size="icon"
                aria-label="File information"
                aria-pressed={details}
                onClick={() => {
                  setDetails(!details);
                  onDetailsChange?.(!details);
                }}
              >
                <Info />
              </Button>
            </Tip>
            {file && file.kind !== "folder" && (
              <OpenWithButton key={file.path} file={file} />
            )}
          </div>
        </header>
      ) : (
        <div className="preview-toolbar">
          <span>Inspector</span>
          <div>
            {file && (
              <Tip label="Quick look">
                <Button
                  size="icon"
                  aria-label="Expand preview"
                  onClick={onExpand}
                >
                  <Maximize2 size={15} />
                </Button>
              </Tip>
            )}
            <Button size="icon" aria-label="Close inspector" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
      )}
      {!file ? (
        <div className="preview-empty">
          <p>
            {selectionCount > 1
              ? `${selectionCount} items selected`
              : "No selection"}
          </p>
        </div>
      ) : large ? (
        <div className="quicklook-workspace">
          <div className="preview-body">
            <Content
              file={file}
              onOpen={onOpen}
              onMediaSize={onMediaSize}
              line={line}
            />
          </div>
          {details && (
            <aside className="quicklook-details">
              <FileDetails file={file} />
              <Button size="sm" onClick={() => onCopyPath(file.path)}>
                <Link2 size={14} />
                Copy path
              </Button>
            </aside>
          )}
        </div>
      ) : (
        <>
          <div className="preview-body">
            <div className="inspector-content">
              <Content file={file} onOpen={onOpen} compact />
            </div>
            <div className="preview-file-heading">
              <h3>{file.name}</h3>
            </div>
            <FileDetails file={file} />
          </div>
          <div className="preview-footer">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCopyPath(file.path)}
            >
              <Link2 size={14} />
              Copy path
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
