# Development notes

This is the shared home for repository-operational knowledge that is useful to
Resource Adapter contributors but does not belong in the public README.

## Adding a new secret

Doppler (`oak-resource-adapter` project) is the source of truth. To add a
secret:

1. Add it to Doppler in every config that needs it (`dev`, `stg`, `prd`).
2. If any `turbo run` task reads it, declare it in that task's `env` (or
   `globalEnv`) in [`turbo.json`](../turbo.json). Turbo hashes caches on declared
   env vars only — an undeclared secret means stale or cross-environment cache.
   Declare it on `build` only if it is read while building: the `NEXT_PUBLIC_*`
   values are baked into the client bundle, so a build belongs to one environment.
3. Nothing to do for CI: jobs fetch what they need from Doppler at run time.
   Locally, `pnpm doppler:pull:dev` refreshes the gitignored `.env` read by
   repository tooling.

## How CI reads secrets

`DOPPLER_TOKEN` is the only secret CI holds. There is no `DATABASE_URL` secret at
repository or Environment level, and no workflow carries a database credential.

The same name at every scope is deliberate: GitHub resolves an Environment secret
over the repository one for any job declaring that `environment:`.

| Scope                    | Doppler config | Used by                                                                 |
| ------------------------ | -------------- | ----------------------------------------------------------------------- |
| Repository secret        | `stg_github`   | pull request CI, for the Clerk test credentials                         |
| `staging` Environment    | `stg_github`   | [`db-migrate.yml`](../.github/workflows/db-migrate.yml) against staging |
| `production` Environment | `prd_github`   | the same workflow against production                                    |

Each token is read-only and scoped to one Doppler config, so a staging job cannot
reach production values. `stg_github` and `prd_github` are branch configs
inheriting from the `stg` and `prd` roots.

## Applying migrations

[`db-migrate.yml`](../.github/workflows/db-migrate.yml) is the only way migrations
reach a deployed database — `workflow_dispatch` to run one by hand, `workflow_call`
for a deployment workflow to gate on. It takes an `environment` and returns nothing;
its job conclusion is the signal.

Migrations must be backwards compatible: see
[database](DATABASE.md#changing-the-schema).

## Changing the API contract

`contractVersion` in
[`packages/contracts/src/v1.ts`](../packages/contracts/src/v1.ts) versions the
HTTP contract, independently of the npm package version. Increment it for a
breaking change to the wire format, not for an npm release.

The versioned procedure in
[`packages/contracts/src/server.ts`](../packages/contracts/src/server.ts)
accepts only the current version, which is right while `v1` is the only one.
Adding `v2` means widening that check as well, because a deployed API has to
keep serving the OWA release already in production until it moves.

## Testing a deployed candidate

Run the deployment-safe browser tests against a deployed harness Preview:

```sh
E2E_BASE_URL=https://example-harness.vercel.app pnpm test:e2e:deployment
```

The harness must point to the API candidate under test. The command reads the
Clerk test credentials from `.env` and refuses to run without `E2E_BASE_URL`, so
it can't accidentally test local services. Tests tagged `@deployment-safe` must
not depend on local-only state or write shared data.

## Package release enforcement

`@oaknational/resource-adapter` and
`@oaknational/resource-adapter-contracts` are preconfigured as a fixed
Changesets group. OWA will install only the UI package; the matching contracts
package is versioned and published alongside it.

The repository is currently in pre-release product development, so individual
pull requests do **not** need a changeset, and nothing publishes. Two GitHub
Actions repository variables hold that state, and both are dormant unless set
to exactly `true`:

- `ENFORCE_CHANGESETS` gates the CI check that requires a changeset on any PR
  touching a published package.
- `ENABLE_NPM_RELEASES` gates the whole [Release
  workflow](../.github/workflows/release.yml) job. It matters because the
  changesets action treats "no changesets pending" as "publish anything not yet
  on npm", so without this gate every qualifying run on `production` would
  attempt a publish.

Both are currently unset, and `production` doesn't exist, so nothing publishes.

## Describing a package change

Once Changesets enforcement is enabled, a pull request that changes either
published package must include a Changeset:

```sh
pnpm changeset
```

Select the affected package and a `patch`, `minor` or `major` bump. The two
packages form a fixed group, so Changesets gives both the same final version even
when only one is selected. Write the summary for package consumers: it becomes a
changelog entry. Commit the generated `.changeset/*.md` file with the change.

CI compares the pull request with its base branch and checks this metadata when
`ENFORCE_CHANGESETS=true`. Documentation, CI and API-only changes do not need a
Changeset.

## How package publishing works

Package release is part of the production process, not a consequence of merging
ordinary work into `main`:

1. Changes with their Changesets accumulate on `main`.
2. A tested `release/YYYY-MM-DD` branch is merged into `production`.
3. After CI succeeds on that exact `production` commit, `release.yml` opens or
   updates `chore: version packages` against `production`.
4. Once the corresponding production API is healthy, QA reviews and merges the
   version PR.
5. CI passes on the version commit and `release.yml` runs `pnpm ci:publish`,
   publishing both packages, tags and GitHub releases.
6. The completed release metadata is synced from `production` back into `main`.

The authoritative operational sequence, including API deployment and OWA, is in
the [release process](RELEASE_PROCESS.md).

The Changesets `baseBranch` remains `main` because contributors branch from and
open feature pull requests into `main`. The Release workflow separately sets its
version PR target to `production`.

The Version Packages PR consumes the Changeset files, updates both package
versions and changelogs, and updates the lockfile. Further commits to
`production` with Changesets update the same PR. A run with no pending Changesets
only attempts to publish versions already present in the checked-out commit but
not on npm.

`pnpm ci:publish` builds the UI and contracts packages before calling
`changeset publish`. pnpm rewrites the UI package's `workspace:*` contracts
dependency to the released version in the published artifact. Each package also
has a `prepublishOnly` build as a safeguard for manual publishing.

## npm publishing infrastructure

Publishing needs no npm token. The Release workflow authenticates through OIDC
trusted publishing, configured once per package on npmjs.com for the
`oaknational/oak-resource-adapter` repository and `release.yml`. Renaming that
workflow file would break the trust configuration.

The first publish of each package must be manual because npm only allows a
trusted publisher to be configured for an existing package:

```sh
pnpm turbo run build --filter=@oaknational/resource-adapter...
pnpm --filter @oaknational/resource-adapter-contracts publish --access public --no-git-checks
pnpm --filter @oaknational/resource-adapter publish --access public --no-git-checks
```

The build matters: both packages ship only `dist/`, which is gitignored, so
publishing from a clean checkout without building would upload a tarball with no
code in it, and an npm version cannot be replaced afterwards. Each manifest also
carries a `prepublishOnly` hook that runs the build, so the publish is safe even
if the build step above is skipped.

`RELEASE_GITHUB_TOKEN` is a fine-grained PAT with Contents and Pull requests
read/write access. It lets the version PR trigger CI; it is not an npm
credential. The workflow commits through the GitHub API (`commitMode:
github-api`), and Doppler's `DOPPLER_TOKEN` plays no part in package publishing.

The package configuration is in [`.changeset`](../.changeset/).
