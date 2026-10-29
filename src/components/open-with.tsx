import { useEffect, useState } from "react";
import * as Context from "@radix-ui/react-context-menu";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  AppWindow,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { DesktopApplication, FileEntry } from "../../shared/types";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Tip } from "./ui/tooltip";
import { toast } from "./ui/notifications";

type MenuKind = "context" | "dropdown";
function Applications({ file, kind }: { file: FileEntry; kind: MenuKind }) {
  const [data, setData] = useState<{
    path: string;
    apps: DesktopApplication[];
  } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    api
      .applications(file.path, controller.signal)
      .then((apps) => {
        if (!controller.signal.aborted) setData({ path: file.path, apps });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [file.path, revision]);
  const Item = kind === "context" ? Context.Item : Dropdown.Item;
  const apps = data?.path === file.path ? data.apps : null;
  if (error)
    return (
      <>
        <div className="application-menu-error" role="status">
          {error}
        </div>
        <Item
          className="menu-item"
          onSelect={(event) => {
            event.preventDefault();
            setRevision((value) => value + 1);
          }}
        >
          <RefreshCw size={15} />
          <span>Try again</span>
        </Item>
      </>
    );
  if (!apps)
    return (
      <Item className="menu-item" disabled>
        <LoaderCircle size={15} className="spin" />
        <span>Loading applications…</span>
      </Item>
    );
  if (!apps.length)
    return (
      <Item className="menu-item" disabled>
        <span>No registered applications</span>
      </Item>
    );
  return (
    <>
      {apps.map((app) => (
        <Item
          key={app.id}
          className="menu-item"
          textValue={app.name}
          onSelect={() => {
            void api
              .openExternal(file.path, app.id)
              .catch((error) => toast.error(error.message));
          }}
        >
          <AppWindow size={15} />
          <span>{app.name}</span>
          {app.isDefault && <span className="menu-key">Default</span>}
        </Item>
      ))}
    </>
  );
}

export function OpenWithSubmenu({
  file,
  kind,
  disabled,
}: {
  file: FileEntry;
  kind: MenuKind;
  disabled?: boolean;
}) {
  const Menu = kind === "context" ? Context : Dropdown;
  return (
    <Menu.Sub>
      <Menu.SubTrigger className="menu-item" disabled={disabled}>
        <ExternalLink size={15} />
        <span>Open with</span>
        <ChevronRight size={14} />
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent
          className="menu application-menu"
          sideOffset={4}
          alignOffset={-4}
          collisionPadding={8}
          loop
        >
          <Applications file={file} kind={kind} />
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}

export function OpenWithButton({ file }: { file: FileEntry }) {
  return (
    <Dropdown.Root>
      <Tip label="Open with">
        <Dropdown.Trigger asChild>
          <Button
            size="icon"
            aria-label="Open with"
            disabled={!file.accessible}
          >
            <ExternalLink />
          </Button>
        </Dropdown.Trigger>
      </Tip>
      <Dropdown.Portal>
        <Dropdown.Content
          className="menu application-menu"
          sideOffset={6}
          align="end"
          collisionPadding={8}
          loop
        >
          <Applications file={file} kind="dropdown" />
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
