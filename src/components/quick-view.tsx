import { useEffect, useState } from "react";
import type { FileEntry } from "../../shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Preview } from "./preview";

export function QuickView({
  file,
  files,
  onChange,
  onOpen,
  onCopyPath,
  onOpenWith,
  line,
}: {
  file: FileEntry | null;
  files: FileEntry[];
  onChange: (file: FileEntry | null) => void;
  onOpen: (path: string) => void;
  onCopyPath: (path: string) => void;
  onOpenWith: (file: FileEntry) => void;
  line?: number;
}) {
  const [viewport, setViewport] = useState({
    width: innerWidth,
    height: innerHeight,
  });
  const [media, setMedia] = useState<{
    path: string;
    width: number;
    height: number;
  } | null>(null);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    const resize = () =>
      setViewport({ width: innerWidth, height: innerHeight });
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!file) {
      setDetails(false);
      setMedia(null);
    }
  }, [file]);
  const maxWidth = Math.min(viewport.width - 24, viewport.width * 0.9),
    maxHeight = viewport.height * 0.88;
  const visual = file?.kind === "image" || file?.kind === "video";
  const measured = visual && media?.path === file?.path ? media : null;
  const panelWidth = details ? Math.min(250, maxWidth * 0.35) : 0;
  const scale = measured
    ? Math.min(
        1,
        (maxWidth - panelWidth) / measured.width,
        (maxHeight - 46) / measured.height,
      )
    : 1;
  const document = !!line || ["text", "code", "pdf"].includes(file?.kind ?? "");
  const width = Math.min(
    maxWidth,
    Math.max(
      Math.min(420, maxWidth),
      measured
        ? measured.width * scale + panelWidth
        : (document ? 900 : visual ? 720 : 480) + panelWidth,
    ),
  );
  const height = Math.min(
    maxHeight,
    measured
      ? Math.max(details ? 260 : 0, measured.height * scale) + 46
      : document
        ? 720
        : visual
          ? 450
          : 300,
  );
  const index = files.findIndex((item) => item.path === file?.path);
  return (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open) onChange(null);
      }}
    >
      <DialogContent
        className={`quicklook-dialog ${visual ? "quicklook-media" : ""}`}
        style={{ width, height }}
        onKeyDownCapture={(event) => {
          if (
            event.code === "Space" &&
            !(event.target as HTMLElement).closest(
              "input,textarea,select,[contenteditable=true]",
            )
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) onChange(null);
          }
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.target as HTMLElement).focus();
        }}
      >
        <DialogTitle className="sr-only">
          {file?.name || "Quick View"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Press Space or Escape to close. Use left and right arrows to browse
          files.
        </DialogDescription>
        <Preview
          file={file}
          large
          onOpen={onOpen}
          onCopyPath={onCopyPath}
          onOpenWith={onOpenWith}
          line={line}
          onMediaSize={(width, height) => {
            if (file && width > 0 && height > 0)
              setMedia({ path: file.path, width, height });
          }}
          onDetailsChange={setDetails}
          hasPrevious={index > 0}
          hasNext={index >= 0 && index < files.length - 1}
          onPrevious={() => {
            if (index > 0) onChange(files[index - 1]);
          }}
          onNext={() => {
            if (index >= 0 && files[index + 1]) onChange(files[index + 1]);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
