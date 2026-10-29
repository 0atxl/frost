import { useEffect, useState } from "react";
import { AppWindow, LoaderCircle } from "lucide-react";
import type { DesktopApplication, FileEntry } from "../../shared/types";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function OpenWith({
  file,
  onClose,
}: {
  file: FileEntry;
  onClose: () => void;
}) {
  const [apps, setApps] = useState<DesktopApplication[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api
      .applications(file.path, controller.signal)
      .then(setApps)
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [file.path]);
  async function open(id: string) {
    setBusy(id);
    setError("");
    try {
      await api.openExternal(file.path, id);
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="open-with-dialog">
        <DialogTitle>Open with</DialogTitle>
        <DialogDescription className="truncate" title={file.name}>
          {file.name}
        </DialogDescription>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!apps && !error && (
          <p className="find-message">
            <LoaderCircle size={16} className="spin" />
            Loading applications…
          </p>
        )}
        {apps?.length === 0 && (
          <p className="find-message">
            No applications are registered for this file type.
          </p>
        )}
        <div className="application-list">
          {apps?.map((app) => (
            <button
              key={app.id}
              onClick={() => void open(app.id)}
              disabled={!!busy}
            >
              {busy === app.id ? (
                <LoaderCircle size={20} className="spin" />
              ) : (
                <AppWindow size={20} />
              )}
              <span>{app.name}</span>
              {app.isDefault && <small>Default</small>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
