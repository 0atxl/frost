# Frost

[![CI](https://github.com/0atxl/frost/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/0atxl/frost/actions/workflows/ci.yml)

[Repository](https://github.com/0atxl/frost), private. GitHub access is required to clone it and view its Actions runs.

A local browser interface for files on your computer. It opens at Home and can navigate anywhere your user account has access. It requires no browser extension and does not upload files.

The toolbar shows clickable breadcrumbs. Click an ancestor to navigate, or click the current folder or press `/` to edit the full path in place. Enter navigates and Escape cancels. The footer shows the folder name and item count. The sidebar, inspector, and Quick View are optional.

## Run locally

Requires Linux, a supported Node.js release satisfying `>=22.13`, npm, Python 3 with PyGObject, and a working GIO/GVfs desktop session. CI uses Node.js 24. Desktop integration uses the same user session as your system file manager. Start Frost as your normal user, not with sudo.

On Ubuntu/Debian, install desktop dependencies with `sudo apt install python3-gi gir1.2-glib-2.0 gvfs gvfs-backends`. On Arch Linux, use `sudo pacman -S python-gobject gvfs`. Run inside your normal graphical desktop session with its session D-Bus available.

Clone using SSH with a key registered to a GitHub account that has repository access:

```sh
git clone git@github.com:0atxl/frost.git
cd frost
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317**. Keep the process running while using Frost. Stop it with Ctrl+C. After updating backend files, stop and restart the process.

On first launch, enter an access key of at least 4 characters, press Enter, then enter it again to confirm. Subsequent visits show a single unlock field. Actions → Change access key accepts the current key and a new key, then locks every tab. Actions → Lock Frost locks the app. Actions → Automatic lock offers inactivity timeouts or Never. Sessions also expire after 12 hours and when the server restarts.

For development with live frontend updates:

```sh
npm run dev
```

The development UI uses port 4317 and proxies the filesystem service on port 4318. Production serves both from port 4317. Backend changes still require a restart.

## Features

- Full path entry, `~` expansion, back/forward/up navigation, Favorites, and pinned folders. Right-click a folder to pin or unpin it, or right-click empty space to pin the current folder.
- Grid and list layouts, sorting, hidden files, and filename filtering within the current folder.
- A Spotlight-style Find panel with fuzzy filename matching, text-content search, optional subfolders, keyboard navigation, and matching-line previews. Open it with Find or Ctrl/Cmd + K.
- Drag-selection rectangles with edge scrolling, keyboard selection, copy/cut/paste, folder creation, rename, and moves within a filesystem.
- System Trash with restore, Undo when the desktop returns the new Trash item, permanent deletion, and confirmed emptying. Old Frost Trash items remain available for recovery.
- Mounted drives and volumes in the Devices sidebar, refreshed every eight seconds. Unmounted volumes are labeled through their tooltip and remain disabled; mount or unlock them using the system desktop.
- Mounted SSHFS folders, including read-only mounts. Frost uses their local paths and does not establish SSH connections.
- Image thumbnails with a bounded memory cache; image, PDF, audio, video, Markdown, code, and text previews. Unsupported files retain metadata and can be checked for readable text.
- A resizable inspector and Quick View. Images and videos determine the preview window's proportions within screen limits; documents use a scrolling reading area. Space opens and closes Quick View.
- Open in default app and an Open with submenu populated from registered Linux file associations, plus Open folder in new browser tab. In file menus, hover over Open with or click it to expand the submenu. In Quick View, click Open with for an anchored dropdown; the preview stays open. File changes made in Frost notify other tabs on the same origin.
- Light/dark/system appearance, a matching app lock, delayed loading indicator, and notifications with a countdown that pauses during interaction.

File operations affect real files. Name collisions are reported and skipped; there is no overwrite action. Files changed concurrently by another process can cause an operation to fail. Refresh or refocus Frost after external changes.

## Available folders and state

The default starting directory is Home. An explicit path in the URL overrides it. The default accessible root is `/`; Linux permissions and read-only mounts still apply. System interfaces under `/proc`, `/sys`, and `/dev` can be listed but cannot be previewed or launched as documents. Frost's own data directory is excluded from browsing and file operations.

Set a narrower root or a different starting folder if needed:

```sh
FROST_ROOT=/home/you/Documents FROST_START_PATH=/home/you/Documents npm start
```

| Variable           | Default                                | Purpose                                                                                     |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `FROST_ROOT`       | `/`                                    | Root of the permitted filesystem tree. Paths and symlink targets outside it are rejected.   |
| `FROST_START_PATH` | Your home directory                    | Starting folder, unless the URL contains a path.                                            |
| `FROST_DATA_DIR`   | `.frost-data` in the working directory | Access-key hash, settings, and earlier Frost Trash. Use the same directory across launches. |
| `PORT`             | `4317`                                 | Production port. Development uses 4317 and 4318.                                            |

## App lock

The server verifies the access key using a salted scrypt hash and throttles failed attempts. The key is not stored in the browser. File APIs, previews, thumbnails, streams, operations, and desktop launching require an unlocked session. Manual locking invalidates all current sessions and closes active media streams. Tabs on the same origin synchronize lock state; status polling also detects server-side expiry. Already opened external applications are independent of Frost's lock.

The service listens only on `127.0.0.1`, checks hosts and origins, and uses an HttpOnly SameSite cookie plus a request token for mutations. Preview content is restricted: HTML displays as source, Markdown does not execute HTML or load remote images, and file responses have sandbox headers. This is a personal local app, not a remotely hosted file server. The lock does not encrypt files or replace the operating-system screen lock.

While locked, Ctrl/Cmd + F toggles local recovery instructions and Escape dismisses them. Recovery instructions do not bypass authentication. If you forget the key, stop Frost and remove only `FROST_DATA_DIR/access.json`, then restart to create a new key. Do not remove the whole data directory: it may contain earlier Frost Trash files. Anyone who already controls your OS account can perform this reset.

## Find

The existing filter narrows the visible folder by filename. **Find** opens a compact 460px panel above the center of the screen. Its height grows with results, then the list scrolls. Type to search, use arrow keys to select, Enter to open, and Escape to close. Names and Contents share the same panel: Names ranks fuzzy filename matches; Contents looks for a case-insensitive word or phrase inside text, code, or readable files without a recognized extension. Names/Contents sits beside the query; the folder scope and Subfolders checkbox share the row below. Enable Subfolders to search recursively. The current Show hidden files setting applies. Folder symlinks are not traversed, and special files, system interfaces, and Frost’s data folder are excluded. Filesystem permissions are unchanged, including on SSHFS.

Search runs on demand without a persistent index. It returns up to 250 results, examines up to 10,000 entries, and stops at the next filesystem-operation boundary after ten seconds. Slow or disconnected network mounts can delay an operation. Cancel stops the request and further traversal once pending filesystem I/O finishes. Contents reads the first 256 KB and returns up to five matching lines per file. A small Partial results indicator appears when limits or skipped files affect the results; hover or focus it for details. Opening a content result shows the matching line in Quick View.

## Thumbnail cache

Grid view reuses generated image thumbnails when you revisit a folder. Each browser tab keeps up to 32 MiB of compressed thumbnails in memory, and the server has a separate 32 MiB cache shared across tabs. Each cache also has a 1,024-entry limit and drops the least recently used entries first. These limits cover cached image payloads; decoding, visible images, and the rest of the app use additional RAM.

Frost requests thumbnails only near the visible area, with at most two requests per tab and two image-generation jobs on the server. File paths, modification times, and sizes identify cached versions. Refresh or refocus after external file changes so the folder listing picks up their new versions.

Locking clears the tab caches and the shared server cache. Automatic expiry clears each expired tab's cache, and the server cache clears when the last session expires. Closing a tab or restarting the server also discards its cache. Frost does not save thumbnail cache files or use persistent browser storage for them. Thumbnail responses use `Cache-Control: no-store`.

SVGs display directly. PDFs, videos, and other file types keep their existing icons in the grid; their Quick View previews are unchanged.

## Trash

New removals use **Linux system Trash** through GIO. Its contents are shared with compatible desktop file managers. Restores do not overwrite existing files. Locations without Trash support report an error; Frost never substitutes permanent deletion automatically. Empty Trash deletes only the items shown at the time you confirm, including any earlier Frost Trash items in that view.

Earlier private Trash contents remain under `FROST_DATA_DIR/trash`. They are included alongside system Trash, without being migrated or removed automatically. Keep that directory until those items have been restored or deliberately deleted.

## Shortcuts

| Action                                           | Shortcut                             |
| ------------------------------------------------ | ------------------------------------ |
| Edit the path                                    | `/`                                  |
| Recovery help while locked                       | Ctrl/Cmd + F                         |
| Filter this folder                               | `F`                                  |
| Find names or contents                           | Ctrl/Cmd + K                         |
| Open folder or preview                           | Enter                                |
| Toggle Quick View / open folder                  | Space                                |
| Navigate selection                               | Arrow keys                           |
| Extend selection                                 | Shift + click or Shift + arrows      |
| Add/remove selected item                         | Ctrl/Cmd + click                     |
| Add a selection rectangle                        | Ctrl/Cmd or Shift + drag empty space |
| Select all visible items                         | Ctrl/Cmd + A                         |
| Copy / cut / paste                               | Ctrl/Cmd + C / X / V                 |
| Rename                                           | F2                                   |
| Move to Trash                                    | Delete                               |
| Show hidden files                                | Ctrl/Cmd + Shift + .                 |
| Close Quick View / clear selection / cancel drag | Escape                               |

## Current limits

- Linux desktop integration only. Phones, internal tabs, and remote sharing are deferred.
- Find does not index the filesystem, extract text from PDF/Office documents, or search inside archives. The toolbar filter still searches only filenames in the open folder.
- Browser media playback depends on installed browser codecs. Use Open in default app for unsupported movies. Password-protected PDFs need an external reader.
- Text previews stop at 256 KB. Very large images keep their file icon. Folder sizes are not calculated recursively.
- Moves between filesystems remain unsupported; copy works between them. System Trash support depends on the mount and the desktop.
- No directory merging, overwrite workflow, filesystem repair, drive formatting, or phone management.

## CI and releases

The [CI workflow](https://github.com/0atxl/frost/actions/workflows/ci.yml) runs the complete `npm test` suite and `npm run build`, including TypeScript compilation, on GitHub-hosted Ubuntu runners for pushes, pull requests, and manual dispatches. Tests use temporary filesystem fixtures. GIO Trash coverage runs in a private D-Bus session with isolated XDG state. Lock, Find, and thumbnail tests cover server behavior and browser-cache logic without launching a browser.

CI does not validate attached drives, SSHFS mounts, graphical application launching, browser interactions, or media codec support. Check these manually in your desktop session before a release. After a passing run, review the changes and coverage limits, tag the chosen commit, and create a private GitHub release if needed. Install or update locally with `npm ci`, `npm run build`, and `npm start`; stop the existing process before restarting. Frost stays on loopback and has no GitHub Pages deployment.
