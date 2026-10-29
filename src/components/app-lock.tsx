import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { LockStatus } from "../../shared/types";
import { api } from "../lib/api";
import { readStorage } from "../lib/utils";
import { toast } from "./ui/notifications";
import { App } from "../App";

export function AppLock() {
  const [status, setStatus] = useState<LockStatus | null>(null);
  const [key, setKey] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const dots = useRef<HTMLDivElement>(null);
  const cursorFrame = useRef(0);
  const cursor = useRef({ x: 0, y: 0 });
  const [recovery, setRecovery] = useState(false);
  useEffect(() => () => cancelAnimationFrame(cursorFrame.current), []);
  const sync = useCallback(async () => {
    try {
      const next = await api.lockStatus();
      setStatus((old) =>
        old &&
        old.unlocked === next.unlocked &&
        old.setupRequired === next.setupRequired &&
        old.idleMinutes === next.idleMinutes
          ? old
          : next,
      );
      setConnectionError("");
      if (!next.unlocked) {
        toast.dismiss();
        document.title = "Frost";
      }
    } catch {
      setConnectionError(
        "Cannot connect to Frost. Check that the local server is running.",
      );
      setStatus((old) => (old?.unlocked ? { ...old, unlocked: false } : old));
    }
  }, []);
  useEffect(() => {
    void sync();
    const timer = window.setInterval(sync, 5000);
    const locked = () => {
      toast.dismiss();
      document.title = "Frost";
      setStatus((old) => old && { ...old, unlocked: false });
    };
    channel.current = new BroadcastChannel("frost:access");
    channel.current.onmessage = (event) => {
      if (event.data === "locked") locked();
      else void sync();
    };
    window.addEventListener("frost:locked", locked);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      channel.current?.close();
      window.removeEventListener("frost:locked", locked);
      window.removeEventListener("focus", sync);
    };
  }, [sync]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = readStorage<string>("frost:theme", "system");
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    window.addEventListener("storage", apply);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);
  useEffect(() => {
    if (!status?.unlocked) return;
    let last = 0;
    const activity = () => {
      if (Date.now() - last < 15_000) return;
      last = Date.now();
      void api.activity().catch(() => void sync());
    };
    for (const event of ["pointerdown", "pointermove", "keydown", "wheel"])
      window.addEventListener(event, activity, { passive: true });
    return () => {
      for (const event of ["pointerdown", "pointermove", "keydown", "wheel"])
        window.removeEventListener(event, activity);
    };
  }, [status?.unlocked, sync]);
  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy || !status) return;
    setError("");
    if (status.setupRequired && confirmation === null) {
      if (key.length < 4) {
        setError("Use at least 4 characters.");
        return;
      }
      setConfirmation(key);
      setKey("");
      return;
    }
    if (status.setupRequired && key !== confirmation) {
      setError("Keys did not match. Try again.");
      setConfirmation(null);
      setKey("");
      return;
    }
    setBusy(true);
    try {
      const next = await api.unlock(key, status.setupRequired);
      setKey("");
      setConfirmation(null);
      setStatus((old) =>
        old &&
        old.unlocked === next.unlocked &&
        old.setupRequired === next.setupRequired &&
        old.idleMinutes === next.idleMinutes
          ? old
          : next,
      );
      channel.current?.postMessage("unlocked");
    } catch (error) {
      setError((error as Error).message);
      setKey("");
    } finally {
      setBusy(false);
    }
  }
  async function lock() {
    try {
      await api.lock();
      toast.dismiss();
      document.title = "Frost";
      setStatus((old) => old && { ...old, unlocked: false });
      channel.current?.postMessage("locked");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  if (status?.unlocked)
    return (
      <App
        onLock={lock}
        idleMinutes={status.idleMinutes}
        onIdleChange={async (minutes) => {
          try {
            setStatus(await api.lockSettings(minutes));
            channel.current?.postMessage("settings");
          } catch (error) {
            toast.error((error as Error).message);
          }
        }}
      />
    );
  return (
    <div
      className="lock-screen"
      onPointerMove={(event) => {
        cursor.current = { x: event.clientX, y: event.clientY };
        if (cursorFrame.current) return;
        cursorFrame.current = requestAnimationFrame(() => {
          cursorFrame.current = 0;
          if (!dots.current) return;
          const x = cursor.current.x - 104,
            y = cursor.current.y - 104;
          dots.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          dots.current.style.backgroundPosition = `${-x % 24}px ${-y % 24}px`;
          dots.current.style.opacity = "0.35";
        });
      }}
      onPointerLeave={() => {
        cancelAnimationFrame(cursorFrame.current);
        cursorFrame.current = 0;
        if (dots.current) dots.current.style.opacity = "0";
      }}
    >
      <div className="lock-dots" ref={dots} aria-hidden="true" />
      <form
        className="lock-form"
        onSubmit={unlock}
        aria-label={
          status?.setupRequired ? "Create Frost access key" : "Unlock Frost"
        }
      >
        <label className="sr-only" htmlFor="access-key">
          {status?.setupRequired
            ? confirmation === null
              ? "Create an access key, at least 4 characters"
              : "Confirm your access key"
            : "Access key. Press Enter to unlock."}
        </label>
        <input
          id="access-key"
          type="password"
          maxLength={1024}
          autoFocus
          autoComplete={
            status?.setupRequired ? "new-password" : "current-password"
          }
          placeholder={
            !status
              ? "Connecting…"
              : status.setupRequired
                ? confirmation === null
                  ? "Create access key"
                  : "Confirm access key"
                : "Enter access key"
          }
          value={key}
          onChange={(event) => setKey(event.target.value)}
          readOnly={busy || !status}
          aria-busy={busy}
          aria-invalid={!!error}
          aria-describedby={error || connectionError ? "lock-error" : undefined}
        />
        {(error || connectionError) && (
          <p id="lock-error" role="alert">
            {error || connectionError}
          </p>
        )}
        {status && !status.setupRequired && (
          <>
            <button
              type="button"
              className="lock-recovery-toggle"
              aria-expanded={recovery}
              onClick={() => setRecovery(!recovery)}
            >
              Forgot key?
            </button>
            {recovery && (
              <p className="lock-recovery">
                Stop Frost, remove only <code>access.json</code> from its data
                folder, then restart to create a new key. The default location
                is <code>.frost-data/access.json</code> in the Frost project.
                Your files and Trash are kept.
              </p>
            )}
          </>
        )}
      </form>
    </div>
  );
}
