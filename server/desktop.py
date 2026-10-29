"""JSON bridge to the current Linux desktop. Never accepts a shell command."""
import json
import os
import sys
import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

NOFOLLOW = Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS
TRASH = Gio.File.new_for_uri("trash:///")

def trash_items():
    result = []
    iterator = TRASH.enumerate_children("standard::name,standard::display-name,trash::orig-path,trash::deletion-date", NOFOLLOW, None)
    try:
        while True:
            info = iterator.next_file(None)
            if info is None:
                break
            child = TRASH.get_child(info.get_name())
            original = info.get_attribute_byte_string("trash::orig-path") or ""
            result.append({"id": "system:" + child.get_uri(), "name": info.get_display_name(), "originalPath": original,
                           "trashedAt": info.get_attribute_string("trash::deletion-date") or "", "source": "system"})
    finally:
        iterator.close(None)
    return result

def trash_file(item_id):
    if not item_id.startswith("system:trash:///"):
        raise ValueError("Invalid trash item.")
    file = Gio.File.new_for_uri(item_id[len("system:"):])
    parent = file.get_parent()
    if parent is None or not parent.equal(TRASH):
        raise ValueError("Invalid trash item.")
    return file

def devices():
    monitor = Gio.VolumeMonitor.get()
    context = GLib.MainContext.default()
    while context.pending():
        context.iteration(False)
    result, seen = [], set()
    def add(name, mount, identity, removable=False):
        root = mount.get_root() if mount else None
        location = root.get_path() if root else None
        # Phone and virtual URI backends are deliberately outside this release.
        if mount and not location:
            return
        if location == "/" or location in seen:
            return
        readonly = False
        if location:
            seen.add(location)
            try:
                readonly = bool(os.statvfs(location).f_flag & os.ST_RDONLY)
            except OSError:
                pass
        result.append({"id": identity, "name": name, "path": location, "readOnly": readonly, "removable": removable})
    for volume in monitor.get_volumes():
        mount = volume.get_mount()
        drive = volume.get_drive()
        root = volume.get_activation_root()
        if root and root.get_uri_scheme() in ("mtp", "afc", "gphoto2"):
            continue
        add(volume.get_name(), mount, volume.get_uuid() or volume.get_name(), bool(drive and drive.is_removable()))
    for mount in monitor.get_mounts():
        add(mount.get_name(), mount, mount.get_uuid() or mount.get_root().get_uri())
    return result

def run(data):
    command = data["command"]
    if command == "devices":
        return devices()
    if command == "list-trash":
        return trash_items()
    if command == "trash":
        before = {item["id"] for item in trash_items()}
        file = Gio.File.new_for_path(data["path"])
        file.trash(None)
        try:
            return next((item["id"] for item in trash_items() if item["id"] not in before and item["originalPath"] == data["path"]), None)
        except Exception:
            # The move succeeded; a delayed Trash listing must not report it as failed.
            return None
    if command == "restore":
        file = trash_file(data["id"])
        file.move(Gio.File.new_for_path(data["destination"]), Gio.FileCopyFlags.NOFOLLOW_SYMLINKS, None, None, None)
        return True
    if command == "delete-trash":
        # GVfs deletes a top-level Trash item recursively; its children are immutable.
        trash_file(data["id"]).delete(None)
        return True
    if command in ("applications", "open"):
        file = Gio.File.new_for_path(data["path"])
        if command == "applications" or data.get("application"):
            info = file.query_info("standard::content-type", Gio.FileQueryInfoFlags.NONE, None)
            content_type = info.get_content_type()
            default = Gio.AppInfo.get_default_for_type(content_type, False)
            applications = Gio.AppInfo.get_all_for_type(content_type) or []
            if default:
                applications.insert(0, default)
            unique = {}
            for app in applications:
                if app.get_id() and (app.should_show() or (default and app.equal(default))):
                    unique[app.get_id()] = app
            if command == "applications":
                return sorted([{"id": ident, "name": app.get_display_name(), "isDefault": bool(default and app.equal(default))}
                               for ident, app in unique.items()], key=lambda item: (not item["isDefault"], item["name"].casefold()))
            chosen = unique.get(data["application"])
            if chosen is None:
                raise ValueError("This application is no longer registered for this file type.")
        # Keep a launched player's logs and lifetime separate from this JSON pipe.
        saved_out, saved_err = os.dup(1), os.dup(2)
        with open(os.devnull, "w") as quiet:
            try:
                os.dup2(quiet.fileno(), 1)
                os.dup2(quiet.fileno(), 2)
                if data.get("application"):
                    chosen.launch([file], None)
                else:
                    Gio.AppInfo.launch_default_for_uri(file.get_uri(), None)
            finally:
                os.dup2(saved_out, 1)
                os.dup2(saved_err, 2)
                os.close(saved_out)
                os.close(saved_err)
        return True
    raise ValueError("Unknown desktop action.")

try:
    print(json.dumps({"result": run(json.load(sys.stdin))}))
except Exception as error:
    print(json.dumps({"error": error.message if isinstance(error, GLib.Error) else str(error)}))
    sys.exit(1)
