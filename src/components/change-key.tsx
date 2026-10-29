import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";

export function ChangeKey({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (next !== confirm) {
      setError("New keys do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.changeKey(current, next);
      const channel = new BroadcastChannel("frost:access");
      channel.postMessage("locked");
      channel.close();
      window.dispatchEvent(new Event("frost:locked"));
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="key-dialog">
        <DialogTitle>Change access key</DialogTitle>
        <DialogDescription>
          At least 4 characters. All Frost tabs will lock after saving.
        </DialogDescription>
        <form onSubmit={submit} className="key-form">
          <label>
            Current key
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              maxLength={1024}
              readOnly={busy}
            />
          </label>
          <label>
            New key
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={4}
              maxLength={1024}
              readOnly={busy}
            />
          </label>
          <label>
            Confirm new key
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={4}
              maxLength={1024}
              readOnly={busy}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={busy}>
              {busy ? "Saving…" : "Save key"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
