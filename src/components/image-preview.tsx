import { useLayoutEffect, useRef, useState } from "react";
import type { FileEntry } from "../../shared/types";
import { fileUrl } from "@/lib/api";

type Picture = { id: string; url: string; name: string };

export function ImagePreview({
  file,
  onReady,
  onError,
}: {
  file: FileEntry;
  onReady?: (width: number, height: number) => void;
  onError: () => void;
}) {
  const url = fileUrl(file);
  const id = `${url}\0${file.size}`;
  const requested = { id, url, name: file.name };
  const [shown, setShown] = useState<Picture | null>(null);
  const active = useRef<{ id: string } | null>(null);
  useLayoutEffect(() => {
    active.current = { id };
    return () => {
      active.current = null;
    };
  }, [id]);

  const pictures = shown && shown.id !== id ? [shown, requested] : [requested];
  return (
    <div
      className="image-preview image-preview-staged"
      aria-busy={shown?.id !== id}
    >
      {pictures.map((picture) => (
        <img
          key={picture.id}
          src={picture.url}
          alt={shown?.id === picture.id ? picture.name : ""}
          aria-hidden={shown?.id !== picture.id}
          className={shown?.id === picture.id ? undefined : "image-pending"}
          onLoad={
            picture.id === id
              ? async (event) => {
                  const image = event.currentTarget;
                  const request = active.current;
                  try {
                    await image.decode();
                    if (active.current !== request || request?.id !== id) return;
                    if (!image.naturalWidth || !image.naturalHeight)
                      throw new Error("Empty image");
                    // Keep the loaded DOM node when promoting it. A second img
                    // would request the no-store file again and bring back a flash.
                    setShown(picture);
                    onReady?.(image.naturalWidth, image.naturalHeight);
                  } catch {
                    if (active.current === request && request?.id === id)
                      onError();
                  }
                }
              : undefined
          }
          onError={
            picture.id === id
              ? () => {
                  if (active.current?.id === id) onError();
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
