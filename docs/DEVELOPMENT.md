# Development notes

This is the shared home for repository-operational knowledge that is useful to
Resource Adapter contributors but does not belong in the public README.

## Where configuration lives

Local development reads the root `.env`, generated from the Doppler `dev`
config (see [Prerequisites](../README.md#prerequisites)). `pnpm env:pull:dev` is
unavailable.

Preview, `staging` and production get their environment variables from
Terraform Cloud workspace variables, routed by
[`locals.tf`](../infrastructure/project/locals.tf). A sensitive workspace
variable cannot be read back, so workflows hold what they need as GitHub
secrets; see [deployment](DEPLOYMENT.md#secrets-the-workflows-use).

Migrations take their credentials from the GitHub Environment matching the
workflow's target ([`db-migrate.yml`](../.github/workflows/db-migrate.yml)):
`MIGRATION_DATABASE_URL` and the Cloud SQL variables for staging live in the
`staging` Environment, and the production equivalents in `production`. Browser
tests need `CURRICULUM_API_URL` and
`CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY` in both the Actions and
Dependabot secret stores, because capability discovery reads live curriculum
restrictions.

## Adding or rotating a secret

1. Local development: add or change it in the Doppler `dev` config, then
   regenerate `.env`.
2. Hosted: add a `sensitive = true` variable to
   [`variables.tf`](../infrastructure/project/variables.tf), place it against the
   destinations that need it in
   [`locals.tf`](../infrastructure/project/locals.tf), then set the value as a
   workspace variable and apply. An empty value is dropped rather than written,
   so a value that does not exist yet stays absent from the deployment. To
   rotate, change the workspace variable, apply and redeploy.
3. If any `turbo run` task reads it, declare it in that task's `env` (or
   `globalEnv`) in [`turbo.json`](../turbo.json). Turbo hashes caches on declared
   env vars only — an undeclared secret means stale or cross-environment cache.
   Declare it on `build` only if it is read while building: the `NEXT_PUBLIC_*`
   values are baked into the client bundle, so a build belongs to one environment.
4. A workflow that reads the value itself, rather than a deployment reading it,
   needs a GitHub secret too, and a Dependabot copy if the browser tests read it.

## Browser-test model configuration

CI browser tests set `MODEL_TRANSPORT=deterministic`. Unset or `openai` selects
OpenAI and requires `OPENAI_API_KEY`; other values fail configuration validation.
`deterministic` needs no key and overrides one if present, but Clerk, curriculum
access and a local test database are still needed. Deployments are unaffected: the
browser job does not set it, and `VERCEL_ENV=production` rejects it outright.

Playwright reuses an already-running API server, so restart yours after changing
the value or it will keep the transport it started with.

See [deterministic model responses](MODEL_INVOCATION.md#deterministic-model-responses)
for the coverage boundary and response maintenance rule.

## How the browser tests serve the apps

CI serves the build with `next start`, since `pnpm test:e2e` builds first either
way. Locally the apps run under `next dev` so an edit shows up without a rebuild.
`E2E_BUILT_SERVERS=1 pnpm test:e2e` takes the CI path, which is worth doing before
pushing a change to how the apps are served; a source edit then needs a rebuild to
reach the browser. Built-server mode refuses occupied ports rather than reusing
an existing server. Stop local servers first, or use `E2E_BASE_URL` to test a
server you manage yourself.

Serving a build means `NODE_ENV=production`, so
[`playwright.config.ts`](../playwright.config.ts) also sets
`FEATURE_FLAG_TRANSPORT=in-memory` to keep the suite off PostHog. See
[feature flags](FEATURE_FLAGS.md#local-development).

## API readiness

`GET /health` reports liveness; `GET /health/ready` evaluates named readiness
checks, answering 200 with `status: "ready"` only when every check passes. Both
production promotion and the preview workflow gate on it, and the harness status
pill renders whatever checks come back, by label.

Add a new required check to the same response rather than a new endpoint, and give
it a message from a fixed set: the response is public, so a check must never
interpolate a credential, an environment value or an upstream error into it.

## How TypeScript resolves

The root aliases `@typescript/native` to `typescript@7` for the `tsc` CLI and
`typescript` to `@typescript/typescript6` for tools that need the compiler API.
TypeScript 7.0 has no stable programmatic API.

Both Next apps declare the TypeScript 6 alias locally for Next's compiler API
lookup. It provides `tsc6`, so their `type-check` scripts still use the root's
TypeScript 7 `tsc`.

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

[`v1.wire.test.ts`](../packages/contracts/src/v1.wire.test.ts) freezes what v1
puts on the wire against a committed JSON Schema snapshot, so a change to it has
to be argued for in review rather than noticed after a release. Additive,
optional fields are safe; anything else needs a v2. Updating the snapshot to get
CI green is almost always the wrong fix.

## Testing a deployed candidate

Run the deployment-safe browser tests against a deployed harness Preview:

```sh
E2E_BASE_URL=https://oak-resource-adapter-harness-abc123.vercel.thenational.academy pnpm test:e2e:deployment
```

The harness must point to the API candidate under test. The command reads the
Clerk test credentials from `.env` and refuses to run without `E2E_BASE_URL`, so
it can't accidentally test local services. Tests tagged `@deployment-safe` must
not depend on local-only state or alter shared application data. Bounded diagnostic
writes are allowed when each run uses unique keys and attempts cleanup on both
success and failure. A cleanup failure must fail the check and identify the object
that may remain.

Storage has one live deployment round trip; its harness UI tests mock the responses
and run without Google credentials. Locally, after `gcloud auth application-default
login`, run `pnpm test:integration --filter=@oaknational/resource-adapter-storage`
from the repository root to load the bucket setting from `.env`.

## Sonar issues

CI fails on any open Sonar issue, not only on a failed quality gate: a pull
request may introduce none, and `main` carries none. Fix the issue. If it is a
genuine false positive, or the suggested change would be wrong, resolve it in
SonarCloud as "False positive" or "Accepted" with a comment giving the reason,
then re-run the `scan` job.

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

`ENFORCE_CHANGESETS` is unset and `ENABLE_NPM_RELEASES` is `false`, so nothing
publishes.

## Describing a package change

Once Changesets enforcement is enabled, a pull request that changes either
published package must include a Changeset:

```sh
pnpm changeset
```

Select the affected package and a `patch`, `minor` or `major` bump. The three
published packages form a fixed group, so Changesets gives them the same final
version even when only one is selected. Write the summary for package consumers:
it becomes a changelog entry. Commit the generated `.changeset/*.md` file with
the change.

CI compares the pull request with its base branch and checks this metadata when
`ENFORCE_CHANGESETS=true`; Dependabot pull requests are exempt. Documentation,
CI and API-only changes do not need a Changeset.

## How package publishing works

Package release is part of the production process, not a consequence of merging
ordinary work into `main`:

1. Changes with their Changesets accumulate on `main`.
2. A tested `release/YYYY-MM-DD` branch is merged into `production`.
3. After all production CI checks succeed, CI calls `release.yml` to open or
   update `chore: version packages` against `production`.
4. Once the corresponding production API is healthy, QA reviews and merges the
   version PR.
5. CI passes on the version commit and `release.yml` runs `pnpm ci:publish`,
   publishing all three packages, tags and GitHub releases.
6. The completed release metadata is synced from `production` back into `main`.

The authoritative operational sequence, including API deployment and OWA, is in
the [release process](RELEASE_PROCESS.md).

The Changesets `baseBranch` remains `main` because contributors branch from and
open feature pull requests into `main`. The Release workflow separately sets its
version PR target to `production`.

`release.yml` is a reusable workflow called by CI on production pushes. It
inherits the push's SHA, so checkout, Changesets version commits and release tags
all use the commit CI tested. The PR-only changeset check is excluded from its
dependencies; every production check must succeed. Release execution stays
disabled unless `ENABLE_NPM_RELEASES` is exactly `true`.

The Version Packages PR consumes the Changeset files, updates the package
versions and changelogs, and updates the lockfile. Further commits to
`production` with Changesets update the same PR. A run with no pending Changesets
only attempts to publish versions already present in the checked-out commit but
not on npm.

`pnpm ci:publish` builds the UI, contracts and resource-document packages before
calling `changeset publish`. pnpm rewrites their `workspace:*` dependencies to
the released version in the published artifacts. Each package also has a
`prepublishOnly` build as a safeguard for manual publishing.

## npm publishing infrastructure

Publishing needs no npm token. The Release workflow authenticates through OIDC
trusted publishing, configured once per package on npmjs.com for the
`oaknational/oak-resource-adapter` repository and **`ci.yml`**. npm validates the
calling workflow, even though `release.yml` contains the publish step. Both the
CI calling job and the release job grant `id-token: write`. See npm's
[trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).
Under Settings -> Trusted publishing, Allowed actions must permit `npm publish`:
publishers created from 3 September 2026 allow only `npm stage publish`, and
`changeset publish` publishes directly.

The first publish of each package must be manual because npm only allows a
trusted publisher to be configured for an existing package:

```sh
pnpm turbo run build --filter=@oaknational/resource-adapter...
pnpm --filter @oaknational/resource-document publish --access public --no-git-checks
pnpm --filter @oaknational/resource-adapter-contracts publish --access public --no-git-checks
pnpm --filter @oaknational/resource-adapter publish --access public --no-git-checks
```

The build matters: all three packages ship only `dist/`, which is gitignored, so
publishing from a clean checkout without building would upload a tarball with no
code in it, and an npm version cannot be replaced afterwards. Each manifest also
carries a `prepublishOnly` hook that runs the build, so the publish is safe even
if the build step above is skipped.

`RELEASE_GITHUB_TOKEN` is a fine-grained PAT with Contents and Pull requests
read/write access. It lets the version PR trigger CI; it is not an npm
credential. CI forwards it explicitly to `release.yml`, which passes it through
the Changesets action's `github-token` input. The action pushes through the
GitHub API by default, without persisting git credentials.

The package configuration is in [`.changeset`](../.changeset/).
