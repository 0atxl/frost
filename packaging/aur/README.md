# AUR package

The [frost AUR package](https://aur.archlinux.org/packages/frost) is maintained by `0atxl`. Install it with `yay -S frost` or `paru -S frost`, then run `frost` and open `http://127.0.0.1:4317`.

The recipe pins release `v0.1.0` to commit `581218f09fa23d247566862f698ea1cdf783ada2`. Its [remote Arch build](https://github.com/0atxl/frost/actions/runs/41081999599) passed, including loading the installed Sharp addon with system Node and linking to system libvips. The accompanying `.SRCINFO` came from that remote build. The `SKIP` checksums apply to Git sources pinned to full immutable commits. npm dependency integrity comes from the checked-in package lock.

The package uses system Node, Python, PyGObject, GLib/GIO, GVfs, D-Bus and libvips. It compiles Sharp with system Node headers and pinned node-addon-api build headers, then removes the prebuilt Sharp/libvips packages and compiler products. The addon headers are a separate build source because Arch does not supply a `node-addon-api` package. npm JavaScript dependencies and frontend libraries remain part of the application.

`prepare()` and `build()` need network access for locked npm sources. `package()` copies an explicit list of built files into `$pkgdir`. No install hook starts Frost, creates user state, reads the user's home directory, copies a checkout wholesale, or installs credentials and agent notes. The `/usr/bin/frost` launcher uses `/usr/lib/frost`, refuses root and stores state in the user's XDG data directory. Select an existing installation's data with `FROST_DATA_DIR`; see the distribution guide before changing installations.

## Maintainer updates

1. Update `pkgver`, the exact published release commit and `pkgrel` in `PKGBUILD`. Keep sources pinned to immutable commits.
2. Run the manually dispatched AUR preparation workflow. It builds in an Arch container, checks installed contents and system libvips linkage, and produces `.SRCINFO` as an artifact. A clean Arch chroot and a normal desktop session remain the checks for real desktop integration.
3. Copy the generated `.SRCINFO` into this directory and commit the recipe changes to GitHub.
4. In a separate checkout of `ssh://aur@aur.archlinux.org/frost.git`, copy only `PKGBUILD` and `.SRCINFO`, commit and push to `master` when the package update is authorized. Never upload local state, credentials, agent notes or build output to AUR.

GitHub releases and website deployments do not push to AUR automatically. Updates use the normal package-manager workflow. The recipe adds no application updater or background service.
