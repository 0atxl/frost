import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "./ui/button";
export default function PdfPreview({
  url,
  compact = false,
}: {
  url: string;
  compact?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(280),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    setError("");
    setPage(1);
    setLoading(true);
    setDoc(null);
    import("pdfjs-dist").then((pdf) => {
      if (cancelled) return;
      pdf.GlobalWorkerOptions.workerSrc = pdfWorker;
      const task = pdf.getDocument({ url, withCredentials: true });
      dispose = () => {
        void task.destroy();
      };
      task.promise
        .then((value) => {
          if (!cancelled) setDoc(value);
        })
        .catch((e) => {
          if (!cancelled) {
            setError(
              e.name === "PasswordException"
                ? "This PDF is password protected. Download it to open in your PDF reader."
                : "This PDF could not be previewed.",
            );
            setLoading(false);
          }
        });
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [url]);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    setLoading(true);
    doc
      .getPage(page)
      .then((pdfPage) => {
        if (cancelled || !canvas.current) return;
        const viewport = pdfPage.getViewport({ scale: 1 });
        const scale = Math.max(0.1, (width - 24) / viewport.width) * zoom;
        const sized = pdfPage.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const element = canvas.current;
        element.width = Math.floor(sized.width * ratio);
        element.height = Math.floor(sized.height * ratio);
        element.style.width = `${sized.width}px`;
        element.style.height = `${sized.height}px`;
        task = pdfPage.render({
          canvas: element,
          viewport: sized,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        return task.promise;
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((e) => {
        if (!cancelled && e.name !== "RenderingCancelledException") {
          setError("This page could not be rendered.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom, width]);
  return (
    <div className={`pdf-view ${compact ? "pdf-compact" : ""}`} ref={container}>
      {error ? (
        <div className="preview-error">{error}</div>
      ) : (
        <>
          <div className="pdf-canvas">
            {loading && <LoaderCircle className="spin pdf-loading" size={22} />}
            <canvas ref={canvas} aria-label={`PDF page ${page}`} />
          </div>
          {!compact && doc && (
            <div className="pdf-controls">
              <Button
                size="icon"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {page} / {doc.numPages}
              </span>
              <Button
                size="icon"
                aria-label="Next page"
                disabled={page >= doc.numPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight />
              </Button>
              <div className="flex-spacer" />
              <Button
                size="icon"
                aria-label="Zoom out"
                disabled={zoom <= 0.6}
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
              >
                <ZoomOut />
              </Button>
              <Button
                size="icon"
                aria-label="Zoom in"
                disabled={zoom >= 2}
                onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
              >
                <ZoomIn />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
