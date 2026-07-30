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
inheriting from the `stg` and `prd` roots; Vercel will get its own.

## Applying migrations

[`db-migrate.yml`](../.github/workflows/db-migrate.yml) is the only way migrations
reach a deployed database — `workflow_dispatch` to run one by hand, `workflow_call`
for a promotion workflow to gate on. It takes an `environment` and returns nothing;
its job conclusion is the signal.

Migrations must be backwards compatible: see
[database](DATABASE.md#changing-the-schema).

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
  on npm", so without this gate every qualifying run on the release branch would
  attempt a publish.

When the first real package release is being prepared, we will:

1. Add one `v1` changeset covering both packages.
2. Do the manual first publish of each package (see below), then configure its
   trusted publisher on npmjs.com.
3. Create the `production` branch. The Release workflow triggers on CI passing
   there, so nothing publishes until it exists.
4. Set `ENFORCE_CHANGESETS=true` and `ENABLE_NPM_RELEASES=true` together, so the
   two halves of the policy cannot drift apart.
5. From then on, require a changeset for every UI or contracts package change; CI enforces this.
6. Release to `production`; once CI passes there the Release workflow opens a
   "chore: version packages" PR, and merging that PR publishes both packages via
   npm OIDC trusted publishing.

Because the release job never runs while it is gated, the first enable is also
its first real execution. Enable it directly after the manual publish and prove
the pipeline with one throwaway patch changeset.

## Release infrastructure

Publishing needs no npm tokens. The Release workflow authenticates through
OIDC trusted publishing, configured once per package on npmjs.com (org
`oaknational`, repository `oak-resource-adapter`, workflow `release.yml`).
Renaming that workflow file would break publishing, because the filename is
part of what npm trusts.

Because npm only allows a trusted publisher on an existing package, the first
publish of each package is manual, from an npm account in the `@oaknational`
org:

```sh
pnpm turbo run build --filter=@oaknational/resource-adapter...
pnpm --filter <package> publish --access public --no-git-checks
```

The build matters: both packages ship only `dist/`, which is gitignored, so
publishing from a clean checkout without building would upload a tarball with no
code in it, and an npm version cannot be replaced afterwards. Each manifest also
carries a `prepublishOnly` hook that runs the build, so the publish is safe even
if the build step above is skipped.

The only secret the Release workflow uses is `RELEASE_GITHUB_TOKEN`, a
fine-grained PAT (Contents and Pull requests read/write) used so the version
packages PR triggers CI; Doppler's `DOPPLER_TOKEN` plays no part in releases.
The workflow needs no git credentials at all, because it commits the version PR
through the GitHub API (`commitMode: github-api`).

The full package-release configuration is in [`.changeset`](../.changeset/),
and the step-by-step journey from pull request to npm is described in the
[release workflow](RELEASE_WORKFLOW.md).
