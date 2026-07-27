# Release workflow

This document describes how a change to the published packages travels from a
pull request to npm. The release policy (when releases start, changeset
enforcement) and the one-time infrastructure setup are covered in
[development notes](DEVELOPMENT.md); testing unpublished changes inside a host
app is covered in the [UI local development workflow](UI_LOCAL_DEVELOPMENT.md).

In short: each PR that changes the packages includes a small changeset file
recording what changed and how big the version bump should be. A GitHub Action
collects the accumulated changesets into a single version-bump PR, and merging
that PR publishes both packages to npm automatically. No npm password or token
is stored anywhere in the process.

## Terminology

- **Changesets**: the release tool this repository uses. Versions are not
  derived from commit messages (the oak-components approach); instead each
  change is described in a committed markdown file, which the tool later reads
  to bump versions and write changelogs.
- **Changeset file**: the file `pnpm changeset` generates, such as
  `.changeset/lucky-pandas-smile.md`. It records the affected package, a bump
  type (`patch`/`minor`/`major`), and a sentence describing the change.
- **Fixed group**: the configuration rule that keeps
  `@oaknational/resource-adapter` (the UI package) and
  `@oaknational/resource-adapter-contracts` on one shared version number,
  always released together.
- **Version Packages PR**: a PR the pipeline opens automatically, containing
  the version bumps and changelog updates. Merging it is the deliberate
  decision to release.
- **OIDC trusted publishing**: npm's tokenless authentication. npm is
  configured once to trust the workflow `release.yml` in
  `oaknational/oak-resource-adapter`; each run then proves its identity with a
  short-lived signed token from GitHub instead of a stored secret.

## Release lifecycle

The example below follows a bug fix to `ResourceAdapterDialog` from pull
request to npm.

### 1. Describe the change with a changeset

Alongside the fix, run `pnpm changeset`. It asks which packages changed (only
the two publishable ones are offered) and how big the bump is. Choosing
`patch` with the summary "Fix focus trap in the adapter dialog" writes:

```text
---
"@oaknational/resource-adapter": patch
---

Fix focus trap in the adapter dialog.
```

This file is committed with the fix. The summary is written for package
consumers: it becomes the changelog entry.

### 2. Open and merge the pull request

The PR contains the code fix plus
the changeset file. CI runs the usual gates, including `test:artifact`, which
packs both packages and verifies the tarballs are sound.

### 3. The workflow opens the Version Packages PR

Merging to `main` triggers the release workflow:

```yaml
# .github/workflows/release.yml
on:
  push:
    branches: [main]

jobs:
  release:
    if: vars.ENABLE_NPM_RELEASES == 'true'
    steps:
      # ...
      - uses: changesets/action@<commit-sha> # v1.9.0
        with:
          version: pnpm ci:version
          publish: pnpm ci:publish
          commitMode: github-api
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_GITHUB_TOKEN }}
```

Third-party actions are pinned to commit SHAs rather than tags, because a tag
can be moved to different code and this job can publish packages. The job is
also gated on the `ENABLE_NPM_RELEASES` repository variable, so it does nothing
until releases are deliberately switched on (see
[development notes](DEVELOPMENT.md)).

The action looks in `.changeset/`. When changesets are present it runs
`pnpm ci:version` and opens (or updates) a PR titled "chore: version
packages". That PR deletes the changeset files and shows the release content:

- Both `package.json` versions move from 0.1.0 to 0.1.1 together, because of
  the fixed group in [`.changeset/config.json`](../.changeset/config.json):

  ```json
  "fixed": [
    ["@oaknational/resource-adapter", "@oaknational/resource-adapter-contracts"]
  ],
  "access": "public",
  ```

- `packages/ui/CHANGELOG.md` gains a `## 0.1.1` section containing the
  changeset summaries.

The Version Packages PR accumulates: if more PRs with changesets merge before
it is actioned, the workflow updates it, and one release carries all of the
pending changes. Merges without changesets (docs, CI changes) leave it
untouched and publish nothing.

### 4. Merge the Version Packages PR to publish

When the Version Packages PR is merged, the workflow runs again, finds no
changesets pending, and switches to publish mode via `pnpm ci:publish`:

```json
"ci:publish": "turbo run build --filter=@oaknational/resource-adapter... && changeset publish"
```

The filtered build compiles only the contracts and UI packages (no database
environment needed). `changeset publish` finds local versions that are not yet
on npm and publishes both, delegating to `pnpm publish`, which rewrites the
internal `workspace:*` dependency to the exact released version. This rewrite
is necessary because `workspace:*` means "the copy in this monorepo" and is
unresolvable in a consumer's install; pinning the exact version also keeps
the fixed pair in lockstep. Each package's `prepublishOnly` hook rebuilds it at
this point as well, which is redundant after the filtered build above but is what
makes a manual publish outside CI safe. Publishing authenticates through the OIDC
handshake (the `id-token: write` permission in the workflow) rather than a
stored `NPM_TOKEN`, so there is no long-lived credential to steal or rotate,
and npm accepts publishes only from this workflow in this repository.
Credentials exist only on this publishing side: the consuming side of the
pipeline involves no credentials at all, ever. This is the established
precedent in OWA, which already consumes every `@oaknational` package from
the public registry with no auth in its `.npmrc`. The workflow then pushes
git tags such as `@oaknational/resource-adapter@0.1.1` and creates GitHub
Releases carrying the changelog text.

### 5. Consumers install from public npm

A host app picks up the release with a plain
`pnpm add @oaknational/resource-adapter@0.1.1` from the public registry, with
no auth configuration.
