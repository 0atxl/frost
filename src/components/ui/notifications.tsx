import { useEffect, useRef } from "react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { toast as sonner } from "sonner";
type Options = {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
};
function Notice({
  id,
  message,
  kind,
  options,
}: {
  id: string | number;
  message: string;
  kind: "normal" | "success" | "error";
  options: Options;
}) {
  const duration = options.duration ?? (kind === "error" ? 7000 : 4000);
  const progress = useRef<HTMLSpanElement>(null);
  const hovered = useRef(false),
    focused = useRef(false),
    node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let left = duration,
      last = performance.now();
    let frame = 0;
    const tick = () => {
      const now = performance.now(),
        elapsed = now - last;
      last = now;
      if (
        hovered.current ||
        focused.current ||
        document.hidden ||
        !document.hasFocus() ||
        node.current?.closest('[data-visible="false"]')
      ) {
        frame = requestAnimationFrame(tick);
        return;
      }
      left = Math.max(0, left - elapsed);
      if (progress.current)
        progress.current.style.transform = `scaleX(${left / duration})`;
      if (!left) {
        sonner.dismiss(id);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const resetClock = () => {
      last = performance.now();
    };
    document.addEventListener("visibilitychange", resetClock);
    window.addEventListener("focus", resetClock);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resetClock);
      window.removeEventListener("focus", resetClock);
    };
  }, [duration, id]);
  const Icon =
    kind === "success" ? Check : kind === "error" ? CircleAlert : Info;
  return (
    <div
      ref={node}
      className={`notice notice-${kind}`}
      onMouseEnter={() => {
        hovered.current = true;
      }}
      onMouseLeave={() => {
        hovered.current = false;
      }}
      onFocusCapture={() => {
        focused.current = true;
      }}
      onBlurCapture={(event) => {
        focused.current = event.currentTarget.contains(event.relatedTarget);
      }}
    >
      <Icon size={16} className="notice-icon" />
      <div className="notice-content">
        <div>{message}</div>
        {options.description && <p>{options.description}</p>}
      </div>
      {options.action && (
        <button
          className="notice-action"
          onClick={() => {
            options.action!.onClick();
            sonner.dismiss(id);
          }}
        >
          {options.action.label}
        </button>
      )}
      <button
        className="notice-close"
        aria-label="Dismiss notification"
        onClick={() => sonner.dismiss(id)}
      >
        <X size={14} />
      </button>
      <span ref={progress} className="notice-countdown" aria-hidden="true" />
    </div>
  );
}
function notify(
  message: string,
  options: Options = {},
  kind: "normal" | "success" | "error" = "normal",
) {
  return sonner.custom(
    (id) => <Notice id={id} message={message} options={options} kind={kind} />,
    { duration: Infinity },
  );
}
export const toast = Object.assign(notify, {
  success: (message: string, options?: Options) =>
    notify(message, options, "success"),
  error: (message: string, options?: Options) =>
    notify(message, options, "error"),
  dismiss: sonner.dismiss,
});
