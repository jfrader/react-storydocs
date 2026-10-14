# Publishing @jfrader/storybook-docs

## Check a release

Use Node 22.18+ for the maintainer's TypeScript tests and the pinned `pnpm@10.12.1`.
Use Node 24 and npm 11.18.0 for publishing, matching `publish.yml`.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build:package
pnpm smoke:package
```

The smoke command runs `pnpm pack` (including `prepack`), prints and checks the
tarball contents, installs that tarball with npm into a temporary directory under
`node_modules`, and typechecks/builds a synthetic consumer. It checks both public
entries, all virtual declarations without `skipLibCheck`, and emitted engine CSS.
It needs registry access and `tar`; it removes the temporary directory on success
or failure. It uses the installed development versions of React, Vite and TypeScript,
not a peer-version matrix. It does not run a browser.

Both checkout and tarball exports currently point at `dist`, not `src`. Linked
consumers must rebuild the engine after edits. The browser entry imports its CSS
automatically and its declaration references `virtual.d.ts`; consumers importing
the root entry need no extra CSS import or triple-slash reference. A consumer
importing virtual modules alone must also import a type from the root entry to load
those ambient declarations. The Node-only plugin remains at `@jfrader/storybook-docs/vite`.

## First publish: the owner's interactive login

Trusted publishing is configured in an existing npm package's settings. If the
package does not exist yet, the owner must create it by publishing locally first.

1. Confirm the checkout is the reviewed release commit on `master` and clean.
   Check `npm view @jfrader/storybook-docs versions --json --registry=https://registry.npmjs.org`.
   An `E404` can mean the public package does not exist yet. If `0.2.1` already
   exists, do not retry that version: npm versions are immutable.
2. Run the checks above. Pack the release outside the checkout:

   ```bash
   release_dir=$(mktemp -d /tmp/opencode/storybook-docs-release-XXXXXX)
   pnpm pack --pack-destination "$release_dir"
   tar -tzf "$release_dir"/*.tgz
   npm login --registry=https://registry.npmjs.org
   npm whoami --registry=https://registry.npmjs.org
   npm publish "$release_dir"/*.tgz --access public --registry=https://registry.npmjs.org
   ```

   `whoami` must be the owner (`jfrader`) or an authorized package maintainer.
   Complete npm's interactive 2FA challenge. `EOTP` means authorization requires
   a fresh second factor; it is not a build failure. Retry interactively with a
   fresh code/challenge, never disable 2FA or commit an OTP/token. If needed, npm's
   `--otp` option accepts a fresh code, but keep it out of shared shell history.
   Do not request `--provenance` from a local shell: local publishing has no
   supported CI OIDC identity. This initial version will lack CI provenance.
3. Verify `npm view @jfrader/storybook-docs@0.2.1 version dist.integrity --registry=https://registry.npmjs.org`.
   Delete the temporary release directory when finished.
4. Do not push a `v0.2.1` tag after publishing it manually: the tag workflow would
   try to publish the same immutable version again. Configure trust before the next
   release; its new version/tag is the first automated publish.

## Later publishes: trusted publishing (recommended)

On npmjs.com, open the package's **Settings → Trusted publishing** and add GitHub
Actions with these exact, case-sensitive values:

| Field | Value |
| --- | --- |
| Organization or user | `jfrader` |
| Repository | `storybook-docs` |
| Workflow filename | `publish.yml` (not `.github/workflows/publish.yml`) |
| Environment name | Leave empty; this workflow has no environment |
| Allowed actions, if shown | Allow direct `npm publish` |

The workflow uses GitHub-hosted Ubuntu, Node 24, npm 11.18.0, `id-token: write`,
and `npm publish --provenance`. It needs no `NPM_TOKEN` or `NODE_AUTH_TOKEN`.
If npm shows a validation deadline for a new trust configuration, complete an
unpublished release within that deadline (currently two days), or recreate the
configuration. After validating trust, select **Require two-factor authentication
and disallow tokens** in the package's Publishing access settings. OIDC still works.

For each release:

1. Choose a new, unpublished version. Update `package.json` without creating a
   tag (`npm version <version> --no-git-tag-version`), reconcile the pnpm lockfile
   if needed, and run the checks above. Review and merge the version commit to
   `master` through the repository's normal review process.
2. From the merged, clean `master` commit, create and push its matching tag:
   `git tag v<version>` then `git push origin v<version>`.
3. Watch **Publish package** in GitHub Actions. The workflow rejects a tag/version
   mismatch or a release commit not contained in `origin/master`, then checks,
   packs and publishes. Confirm the registry version, integrity and provenance.

`workflow_dispatch` also publishes; it is not a dry run. Dispatch only an
unpublished version from a reviewed commit contained in `master`. Rerunning a
successful publish fails because that version already exists.

## Token publishing: explicit fallback, not the current configuration

The committed workflow uses OIDC only. A token secret alone will not make it use
token authentication. If trusted publishing cannot be used, a maintainer must
explicitly change the publish step to supply `NODE_AUTH_TOKEN` from a repository
secret. Use a short-lived granular token restricted to this package with publish
permission and **Bypass 2FA** enabled; ordinary tokens trigger `EOTP` in CI. The
package's publishing access must permit such tokens. Account/organization policy
may forbid this fallback. Never put an interactive OTP into CI, never use a
read-only token for publishing, and remove/revoke the write token after moving
to OIDC. Keep `--provenance` and GitHub-hosted runners for the fallback too.

## Version hygiene

The current version is `0.2.1`. Packed dependencies installed by filename or URL
remain on that exact tarball until consumers update their manifest and lockfile;
a version bump does not update them automatically. Do not replace an existing
version, reuse a tag, or remove `.`/`./vite`. Treat configuration, virtual module,
CSS delivery, Node/peer minimum and declaration changes as compatibility changes.
Before `1.0`, document any breaking changes and use a minor version bump rather
than hiding them in a patch. Consumers must retain React 19, React DOM 19 and a
compatible Vite, and supply their own story sources and story dependencies: a
design system tarball containing only built components cannot supply source stories.

Official npm references (check them when changing authentication):
[trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[provenance](https://docs.npmjs.com/generating-provenance-statements/),
[granular tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens/).

## First publish of a new package name

Established procedure, after a morning spent rediscovering it:

1. **`npm trust` works before the package exists.** `npm trust github <pkg> --repo <owner>/<repo> --file publish.yml --allow-publish`
   returns **201** even for a name that has never been published, as long as you are authenticated. Do this first; it is
   what lets every later `v*` tag publish itself through OIDC with provenance, no tokens.
2. **Workflows that set `NODE_AUTH_TOKEN` cannot use trusted publishing.** An empty secret sends an
   unauthenticated request and npm answers `404` on the `PUT`, which reads like a missing package. This workflow
   therefore sets no token.
3. **The first publish has to happen once from a machine** — the registry has no artifact yet:

   ```bash
   cd <the package checkout>
   npm login --registry https://registry.npmjs.org     # prints a browser URL; no OTP code needed
   NPM_CONFIG_USERCONFIG=<config> npm publish          # browser URL again, then "+ <pkg>@<version>"
   ```

   A `~/.npmrc` that maps the scope to another registry (e.g. `@scope:registry=https://npm.pkg.github.com/`) makes a
   plain `npm publish` target that registry instead and fail with `403`. Point the scope at npmjs in the config used
   for the publish.
4. **Verify from the registry, not from the local output:** `curl -s https://registry.npmjs.org/<scope>%2f<pkg>`
   must list the version. Until it does, nothing is published.
5. After that, releases are tags: `git tag -a vX.Y.Z && git push origin vX.Y.Z`, and the publish workflow does the
   rest. Do **not** push a tag for a version you already published by hand — npm rejects the duplicate.
