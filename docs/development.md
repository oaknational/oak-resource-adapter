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
3. Consumers get it automatically: `doppler run`-wrapped scripts inject it, and
   `pnpm doppler:pull:dev` refreshes the local `.env` for tools that read env
   files directly.

## Package release enforcement

`@oaknational/resource-adapter` and
`@oaknational/resource-adapter-contracts` are preconfigured as a fixed
Changesets group. OWA will install only the UI package; the matching contracts
package is versioned and published alongside it.

The repository is currently in pre-release product development, so individual
pull requests do **not** need a changeset. The CI check is intentionally
dormant unless the GitHub Actions repository variable
`ENFORCE_CHANGESETS` is exactly `true`.

When the first real package release is being prepared, we will:

1. Add one `v1` changeset covering both packages.
2. Set `ENFORCE_CHANGESETS=true` in the repository's GitHub Actions variables.
3. From then on, require a changeset for every UI or contracts package change; CI enforces this.
4. Merge to `main`; the [Release workflow](../.github/workflows/release.yml)
   opens a "chore: version packages" PR, and merging that PR publishes both
   packages via npm OIDC trusted publishing.

## Release infrastructure

Publishing needs no npm tokens. The Release workflow authenticates through
OIDC trusted publishing, configured once per package on npmjs.com (org
`oaknational`, repository `oak-resource-adapter`, workflow `release.yml`).
Because npm only allows a trusted publisher on an existing package, the first
publish of each package is manual:
`pnpm --filter <package> publish --access public --no-git-checks` from an npm
account in the `@oaknational` org. The only secret the Release workflow uses
is `RELEASE_GITHUB_TOKEN`, a fine-grained PAT (Contents and Pull requests
read/write) used so the version packages PR triggers CI; Doppler's
`DOPPLER_TOKEN` plays no part in releases.

The full package-release configuration is in [`.changeset`](../.changeset/),
and the step-by-step journey from pull request to npm is described in the
[release workflow](RELEASE_WORKFLOW.md).
