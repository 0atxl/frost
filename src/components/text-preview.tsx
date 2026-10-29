import { useEffect, useRef, useState } from "react";
import { LoaderCircle, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
import type { FileEntry, TextPreview } from "../../shared/types";
import { api } from "@/lib/api";
import { FileIcon } from "./file-icon";
const languageMap: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  sh: "bash",
  yml: "yaml",
  md: "markdown",
  html: "xml",
  htm: "xml",
  vue: "xml",
  svelte: "xml",
  h: "c",
  hpp: "cpp",
};

export default function TextContent({
  file,
  raw = false,
  line,
}: {
  file: FileEntry;
  raw?: boolean;
  line?: number;
}) {
  const [data, setData] = useState<TextPreview | null>(null),
    [error, setError] = useState("");
  const matchedLine = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!line || !data) return;
    const frame = requestAnimationFrame(() =>
      matchedLine.current?.scrollIntoView({ block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [data, line]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    api
      .text(file.path, controller.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [file.path, file.modified]);
  if (error) return <div className="preview-error">{error}</div>;
  if (!data)
    return (
      <div className="preview-loading">
        <LoaderCircle className="spin" size={22} />
        Loading preview
      </div>
    );
  if (data.binary)
    return (
      <div className="unsupported">
        <FileIcon kind="unknown" size={44} />
        <strong>This is a binary file</strong>
        <p>Its contents cannot be displayed as text.</p>
      </div>
    );
  if (line) {
    const lines = data.text.split(/\r?\n/);
    const index = Math.min(lines.length - 1, Math.max(0, line - 1));
    return (
      <>
        <div className="preview-notice">
          Line {line}
          {data.truncated ? " · Showing the first 256 KB" : ""}
        </div>
        <pre className="code-preview">
          <code>
            {lines.slice(0, index).join("\n")}
            {index > 0 ? "\n" : ""}
            <mark className="matched-line" ref={matchedLine}>
              {lines[index] || " "}
            </mark>
            {index < lines.length - 1 ? "\n" : ""}
            {lines.slice(index + 1).join("\n")}
          </code>
        </pre>
      </>
    );
  }
  const markdown = ["md", "markdown"].includes(file.extension) && !raw;
  const language = languageMap[file.extension] || file.extension;
  const highlighted =
    !markdown && hljs.getLanguage(language)
      ? hljs.highlight(data.text, { language, ignoreIllegals: true }).value
      : null;
  return (
    <>
      {data.truncated && (
        <div className="preview-notice">
          Showing the first 256 KB of this file.
        </div>
      )}
      {data.text.length === 0 ? (
        <div className="unsupported">
          <FileIcon kind="text" size={40} />
          <p>This file is empty.</p>
        </div>
      ) : markdown ? (
        <div className="markdown-preview">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: () => (
                <span className="markdown-image-note">
                  [Image omitted in preview]
                </span>
              ),
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                  <ExternalLink size={12} />
                </a>
              ),
            }}
          >
            {data.text}
          </ReactMarkdown>
        </div>
      ) : (
        <pre className="code-preview">
          {highlighted ? (
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          ) : (
            <code>{data.text}</code>
          )}
        </pre>
      )}
    </>
  );
}
