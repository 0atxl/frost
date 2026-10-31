# Publish Frost to npm

The public package is `@0atxl/frost`. It installs the `frost` command and uses the project's existing MIT license. No workflow publishes it until you complete the first manual publication and enable the repository setting below.

## Verify a candidate

The **npm package** workflow runs on branch pushes, pull requests and manual dispatch. It runs the complete test suite in isolated XDG/D-Bus state, builds the app, gathers dependency licenses, and creates the actual tarball with `npm pack`. Inspection rejects files outside the package allowlist, credentials, private state, development sources, source maps and links. Deliberate private-file fixtures check that the allowlist excludes user data.

Separate jobs install that tarball into a fresh global npm prefix with production dependencies. They use Node 24 on Ubuntu 22.04 and 24.04, plus the minimum supported Node 22.13 on Ubuntu 24.04. The checkout has no installed dependencies in those jobs. The installed `frost` command starts from an unrelated directory with a read-only package directory. Checks cover compiled assets, authentication, the file API, Sharp, Python/GIO/GVfs, and preservation of stable and legacy state. These are HTTP checks, not browser tests.

Only after every installation job passes does the workflow upload **frost-npm-package-COMMIT**. The earlier **npm-candidate-COMMIT** artifact is an intermediate input and must not be published manually. The verified artifact contains:

- `frost-package.tgz`, the exact tarball that passed installation checks.
- `SHA256SUMS`, a checksum for that tarball.
- `package-files.txt` and `pack.json`, the inspected contents and npm metadata.
- `BUILD-INFO.txt`, the source commit and Actions run.

Verified artifacts expire after 30 days. Rerun the workflow for another candidate if needed. Builds, tests, inspection, and installation checks belong in GitHub Actions. Do not rebuild or repack the first-publication tarball locally.

## First manual publication

Download the verified artifact from its successful GitHub Actions run and extract the artifact ZIP. On your own machine, from the extracted directory:

```sh
sha256sum --check --strict SHA256SUMS
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
# Confirm this prints 0atxl, then publish the verified bytes.
npm publish ./frost-package.tgz --access public --registry=https://registry.npmjs.org/
```

Complete npm's authentication and 2FA prompts yourself. This command publishes the prebuilt tarball directly. No build, pack, or source install is needed. Version `0.1.0` is the first candidate; if it already exists on npm, choose a new version and obtain a new verified artifact. Published versions cannot be replaced.

## Configure subsequent releases

After the first publication, open the npm package's Settings and add a GitHub Actions trusted publisher with these exact values:

| Field | Value |
| --- | --- |
| Organization or user | `0atxl` |
| Repository | `frost` |
| Workflow filename | `npm-publish.yml` |
| Environment | Leave empty |
| Allowed actions | Allow direct `npm publish` |

Follow npm's [trusted publishing instructions](https://docs.npmjs.com/trusted-publishers/). Trusted publishing requires npm >=11.5.1 and Node >=22.14. The publish job uses Node 24, GitHub-hosted runners, `id-token: write`, and no npm token. It publishes the verified tarball with public access and provenance from this public repository. Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN` secrets for this flow.

Once the first publication and trusted publisher configuration are complete, set the repository Actions variable **`NPM_PUBLISH_ENABLED`** to exactly **`true`** in GitHub Settings → Secrets and variables → Actions → Variables. Keep it unset or `false` until then. This setting is the publication gate in `.github/workflows/npm-publish.yml`.

For each subsequent stable release, update `version` in both `package.json` and the root entries of `package-lock.json`. Commit and push the version change, review the successful candidate, then create a matching `vMAJOR.MINOR.PATCH` tag on that commit. The tag workflow rebuilds and verifies the tarball before its separate OIDC job can publish. It refuses a tag that differs from the tarball version or a package name other than `@0atxl/frost`. Retry failed jobs in the same run to reuse uploaded candidate bytes.

The existing **Release** workflow also responds to version tags and publishes the Linux archive to GitHub Releases. That is independent of npm publishing. No tag is created by this preparation, and the npm gate stays disabled.
