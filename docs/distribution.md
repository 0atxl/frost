# Install and distribute Frost

Frost is MIT licensed. Third-party code keeps its own licenses. Binary archives include `LICENSE`, `runtime/LICENSE`, `THIRD_PARTY_NOTICES.json`, copied build dependency notices, the Inter font license, and the original production dependency licenses.

## Linux x64 archive

Download the archive and `SHA256SUMS` from the same [stable release](https://github.com/0atxl/frost/releases/latest). Verify before extracting:

```sh
sha256sum --ignore-missing --check SHA256SUMS
tar -xzf frost-0.1.0-linux-x64.tar.gz
./frost-0.1.0-linux-x64/frost
```

Open `http://127.0.0.1:4317`. Run as your normal desktop user. The launcher refuses root and keeps running until Ctrl+C. It resolves its installation through symlinks and can start from another directory. It does not need npm or a system Node installation. It serves the compiled local UI and binds only to `127.0.0.1`.

The archive targets Linux x86-64 with glibc 2.35 or later, kernel 4.18 or later, and libstdc++. It builds on Ubuntu 22.04 and is exercised on Ubuntu 22.04 and 24.04. Other distributions with those libraries may work but are not covered by these jobs. ARM, musl/Alpine, Windows and macOS packages are not supplied. This is not a universal Linux binary. The official Node runtime has its own [platform requirements](https://github.com/nodejs/node/blob/v24.x/BUILDING.md#supported-platforms).

The archive bundles the pinned Node 24 LTS version in `scripts/release/node.env`, the frontend, compiled backend, `desktop.py`, production npm dependencies, and matching Sharp Linux x64/glibc and libvips native modules. Pin updates require a new release, checksum review, and remote package verification.

## External desktop requirements

Frost calls `/usr/bin/python3` and needs PyGObject, GIO typelibs, GVfs with the desired backends, and an active user D-Bus desktop session. It uses those services for Trash, registered applications and volumes. They are system packages, not part of the archive.

```sh
# Ubuntu / Debian
sudo apt install python3-gi gir1.2-glib-2.0 gvfs gvfs-backends
# Arch Linux
sudo pacman -S python python-gobject glib2 gvfs
```

Launch from your ordinary desktop session. Browser media support still depends on browser codecs. Remote jobs do not certify real drives, SSHFS mounts, graphical app launches, or browser interactions.

## State and upgrades

The launcher chooses state in this order:

1. An explicit `FROST_DATA_DIR`, resolved against the directory from which you invoke Frost.
2. An existing `.frost-data` in that directory.
3. An existing `.frost-data` alongside the installed assets.
4. `$XDG_DATA_HOME/frost`, or `$HOME/.local/share/frost` when XDG is unset.

New state directories use a private umask. Nothing migrates, resets or deletes existing state. When switching from a source installation, point `FROST_DATA_DIR` at the existing absolute data path, especially if launching from a new directory. Keep the access-key hash, settings and legacy Trash together. The source `npm start` command retains its current working-directory default.

Stop Frost before replacing its installation. Extract a new version into a separate directory, retain the same data path, then start the new launcher. No automatic update mechanism is installed. State, personal files and credentials never belong in `/usr/lib/frost` or a release archive.

## Release procedure

The Release workflow supports stable tags such as `v0.1.0`. It resolves the tag to a commit, checks the package version, runs the entire existing test suite in isolated XDG/D-Bus state, builds that commit, packages it, and exercises the extracted artifact without installing dependencies. Both supported Ubuntu smoke jobs and the source tests/build must pass before publication.

For a build-only candidate, open Actions → Release → Run workflow on the desired branch/commit and leave `tag` empty and `publish` off. The run stores the archive, source archive and `SHA256SUMS` as a distribution artifact for 14 days. These are candidate artifacts, not a published release.

After reviewing a candidate, create and push the matching version tag on that exact commit:

```sh
git tag -a v0.1.0 <reviewed-commit> -m 'Frost 0.1.0'
git push origin v0.1.0
```

The tag workflow repeats the required checks against the release commit. Manual recovery accepts an existing tag and `publish: true`. It verifies that the selected tag still matches the checked commit and package version. Publication needs a project `LICENSE`; do not substitute a dependency license.

Assets first enter a draft marked with the exact commit. The workflow verifies GitHub's uploaded SHA-256 digests and the complete asset set before publishing. Published versions are never overwritten. Retry failed jobs in the same run to reuse the original artifact. An identical partial draft is reusable; differing draft bytes cause an explicit failure. To rebuild a failed unpublished version, deliberately delete its draft in GitHub and rerun. Never delete or move a published tag to replace a release. Fixes need a new version.

The publish job explicitly calls Website redeploy after publishing all stable assets. Releases made with `GITHUB_TOKEN` do not reliably trigger a second release-event workflow. Set the Actions secret `VERCEL_DEPLOY_HOOK` as described in `landing/README.md`. A missing or failing hook fails the website job while keeping the already published release intact. Recover by running Website redeploy, without attempting to republish the version.

Repository visibility is never changed by these workflows. Public website metadata uses anonymous requests, and private releases do not produce public download links. The website reads GitHub's latest stable release at build time. Drafts, prereleases, missing assets, unavailable GitHub responses and checksum mismatches produce a source-install state.

## AUR preparation

See `packaging/aur/README.md` and its PKGBUILD. Submission to AUR is a separate maintainer action. Nothing here publishes to AUR or installs user state into system directories.
