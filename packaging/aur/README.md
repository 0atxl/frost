# AUR preparation

This recipe is prepared for review. It has not been submitted to AUR. The recipe pins `v0.1.0` to commit `581218f09fa23d247566862f698ea1cdf783ada2`. Confirm the tag and release before submission. Never use a branch or a moving tag. The `SKIP` checksum is for a Git source pinned to that commit, as usual for VCS sources. npm dependency integrity comes from the checked-in package lock.

The package uses system Node, Python, PyGObject, GLib/GIO, GVfs, D-Bus and libvips. It compiles Sharp with system Node headers and pinned node-addon-api build headers, and removes the prebuilt Sharp/libvips packages. The addon headers are a separate commit-pinned build source because Arch does not supply a `node-addon-api` package. npm JavaScript dependencies and frontend libraries remain part of the application. The manually dispatched AUR preparation workflow builds in an Arch container and records system libvips linkage without submitting anything. A clean Arch chroot and a normal desktop session remain the maintainer checks before submission.

`prepare()` and `build()` need network access for locked npm sources. `package()` only copies a fixed list of built files into `$pkgdir`. No install hook starts Frost, creates user state, reads a user's home directory, copies a checkout wholesale, or installs credentials and agent notes. The `/usr/bin/frost` launcher uses `/usr/lib/frost`, refuses root and stores state in the user's XDG data directory. An existing data directory can be selected with `FROST_DATA_DIR`; see the distribution guide before changing installations.

Maintainer steps, separate from this task:

1. Pin the published release commit, review dependencies against current Arch packages, and build with `extra-x86_64-build` in a clean chroot.
2. Exercise the installed package from a normal user's desktop session and confirm Python/GVfs integration, loopback binding, permissions and state preservation.
3. Generate `.SRCINFO` with `makepkg --printsrcinfo > .SRCINFO`, inspect package contents and license notices, and review the AUR package name.
4. Submit the reviewed PKGBUILD and `.SRCINFO` to AUR only when authorized. Do not upload local state or build output to the AUR Git repository.

Updates are ordinary package-manager upgrades. The recipe adds no application updater or background service.
