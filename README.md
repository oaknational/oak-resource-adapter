# Oak Resource Adapter

Oak Resource Adapter is Oak National Academy's service and UI package for adapting
lesson resources with Aila, Oak's AI Lesson Assistant.

This repository is in initial setup, containing a local and hosted
harness to run the `@oaknational/resource-adapter` inside
an OWA-like host, along with a skeleton API.

## Project policies

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Oak branding and documentation notice](NOTICE.md)
- [Database](docs/DATABASE.md)

Contributor documentation is indexed in [docs/README.md](docs/README.md).

## Architecture notes

- [Background jobs](docs/BACKGROUND_JOBS.md)
- [Model invocation](docs/MODEL_INVOCATION.md)

## Prerequisites

- Node.js 24 LTS (see `.nvmrc`)
- pnpm 10 or later
- Access to Oak's Vercel team, signed in with `pnpm exec vercel login`, before
  refreshing local secrets

Terraform Cloud is the single source of truth for secrets, and it cannot be read
back: a sensitive workspace variable is write-only. So shared development values
are pulled from the API project's Vercel development environment, which Terraform
writes, into a local, gitignored `.env`. Other repository commands read the
process environment or that file. Run this once after cloning, and again whenever
secrets change:

```sh
pnpm env:pull:dev   # writes the development environment into a local, gitignored .env
```

## Commands

```sh
pnpm install
pnpm format
pnpm lint
pnpm deps:check
pnpm type-check
pnpm build
pnpm test
pnpm test:coverage
pnpm test:artifact
pnpm test:e2e
pnpm secrets:scan
pnpm changeset
pnpm docker:db:bootstrap
pnpm docker:db:reset
pnpm docker:db:psql
pnpm docker:db:clear
```

Run `pnpm exec playwright install chromium` once before the first browser test.

## Local harness

The harness is an OWA-like local host for the published UI boundary.

```sh
pnpm dev
```

This starts the harness on port 3000 and the local API on port 3001. The harness page
uses the workspace UI package helper to resolve capabilities, then renders the
package-owned drawer with representative lesson context. The drawer resolves
its own feature flags through the package's internal client helpers. This
mirrors the OWA/package composition boundary.

One difference from OWA: the harness browser calls its own `/adapter-proxy` route,
which forwards to the API server-side. That is what lets a deployed harness be
paired with an API deployment whose URL is only known once it exists. OWA calls
the API directly, so the API's cross-origin handling is covered by unit tests
rather than by the harness.

The API dev server also runs background jobs through Workflow's local runtime,
using the same workflow and step code intended for Vercel. See
[background jobs](docs/BACKGROUND_JOBS.md) for the dummy job smoke test and the
job and durable-output conventions.

## Calling the service

The service API uses tRPC. The typed client is internal to the UI package;
hosts such as OWA or the harness call `getResourceAdapterCapabilities`, while
`ResourceAdapterDialog` fetches feature flags internally, so hosts never depend
on `@trpc/client` themselves:

```ts
import {
  getResourceAdapterCapabilities,
  ResourceAdapterDialog,
} from "@oaknational/resource-adapter";

const capabilities = await getResourceAdapterCapabilities({
  apiBaseUrl: "https://resource-adapter.example",
  getToken,
  lesson,
});

<ResourceAdapterDialog
  apiBaseUrl="https://resource-adapter.example"
  capabilities={capabilities.capabilities}
  getToken={getToken}
  isOpen={true}
  lesson={lesson}
  onClose={() => {}}
/>;
```

## Local database

PostgreSQL, accessed through Drizzle. `DATABASE_URL` is read from the process
environment or the root `.env`. Run `pnpm env:pull:dev` first (see
Prerequisites), then point it at any local PostgreSQL instance you control and
build the schema:

```sh
pnpm db:reset          # drops and recreates the local schema, then migrates
```

### Docker alternative (local PostgreSQL)

```sh
pnpm docker:db:bootstrap

pnpm env:pull:dev
pnpm db:reset
```

To stop and remove it later:

```sh
pnpm docker:db:clear
```

To recreate the container from scratch:

```sh
pnpm docker:db:reset
```

To open a `psql` shell inside the container:

```sh
pnpm docker:db:psql
```

Day to day:

```sh
pnpm db:migrate:dev    # apply migrations someone else added
pnpm db:generate       # write a migration for a schema change you made
```

Note that `db:generate` writes a migration file; it does not create a database.
Migration SQL is committed and reviewed alongside the code that needs it, and CI
fails if a schema change arrives without one.

See [database](docs/DATABASE.md) for the schema, the migration workflow, and the
retention implications of storing prompts and worksheet content.

## Release Versioning

`@oaknational/resource-adapter` and its contracts package release together as
a fixed version group on public npm and are versioned with Changesets. Once
release automation is enabled, [`release.yml`](.github/workflows/release.yml)
publishes them from `production`. The operational sequence is described in the
[release process](docs/RELEASE_PROCESS.md), contributor-facing Changesets
guidance is in [development notes](docs/DEVELOPMENT.md), and testing local
changes inside a host app is in the
[UI local development workflow](docs/UI_LOCAL_DEVELOPMENT.md).
