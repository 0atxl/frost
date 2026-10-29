import { useLayoutEffect, useRef, useState } from "react";
import type { FileEntry } from "../../shared/types";
import { requestThumbnail, thumbnailKey } from "@/lib/thumbnail-cache";
import { FileIcon } from "./file-icon";

export function CachedThumbnail({ file }: { file: FileEntry }) {
  const host = useRef<HTMLSpanElement>(null);
  const key = thumbnailKey(file);
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    let alive = true,
      objectUrl = "",
      started = false;
    let unsubscribe: (() => void) | undefined;
    const start = () => {
      if (started || !alive) return;
      started = true;
      unsubscribe = requestThumbnail(file, {
        loaded(blob) {
          if (!alive) return;
          objectUrl = URL.createObjectURL(blob);
          setFailed(null);
          setImage({ key, url: objectUrl });
        },
        failed() {
          if (alive) setFailed(key);
        },
      });
    };
    // Virtual rows include overscan. Fetch only the visible/near-visible thumbnails.
    const bounds = node.getBoundingClientRect();
    const root = node.closest(".file-scroll");
    const pane = root?.getBoundingClientRect();
    if (
      bounds.bottom >= (pane?.top ?? 0) - 64 &&
      bounds.top <= (pane?.bottom ?? innerHeight) + 64
    )
      start();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          start();
          observer.disconnect();
        }
      },
      { root, rootMargin: "64px" },
    );
    observer.observe(node);
    return () => {
      alive = false;
      observer.disconnect();
      unsubscribe?.();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, file.path, file.modified, file.size]);
  return (
    <span ref={host} className="cached-thumbnail">
      {image?.key === key && failed !== key ? (
        <img
          src={image.url}
          alt=""
          decoding="async"
          onError={() => setFailed(key)}
        />
      ) : (
        <FileIcon kind="image" size={52} />
      )}
    </span>
  );
}
