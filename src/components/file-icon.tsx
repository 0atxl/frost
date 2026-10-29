import {
  Archive,
  File,
  FileCode2,
  FileText,
  Folder,
  Image,
  Film,
  Music2,
} from "lucide-react";
import type { FileKind } from "../../shared/types";
export function FileIcon({
  kind,
  size = 16,
  className = "",
}: {
  kind: FileKind;
  size?: number;
  className?: string;
}) {
  const Icon = {
    folder: Folder,
    image: Image,
    video: Film,
    audio: Music2,
    pdf: FileText,
    text: FileText,
    code: FileCode2,
    archive: Archive,
    unknown: File,
  }[kind];
  return (
    <Icon
      size={size}
      strokeWidth={1.5}
      className={`file-icon icon-${kind} ${className}`}
      aria-hidden="true"
    />
  );
}
