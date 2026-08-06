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
- [Doppler CLI](https://docs.doppler.com/docs/install-cli), authenticated with
  `doppler login`, before refreshing local secrets

Doppler is the single source of truth for secrets. The development pull script
explicitly selects the `oak-resource-adapter` project and writes a local,
gitignored `.env`. Other repository commands read the process environment or
that file without invoking Doppler. Run this once after cloning, and again
whenever secrets change:

```sh
pnpm doppler:pull:dev   # writes the dev config into a local, gitignored .env
```

## Commands

```sh
pnpm install
pnpm format
pnpm lint
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

The API dev server also runs background jobs through Workflow's local runtime,
using the same workflow and step code intended for Vercel. See
[background jobs](docs/BACKGROUND_JOBS.md) for the dummy job smoke test and the
job and durable-output conventions.

## API client

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
  getToken,
  lesson,
  trpcEndpoint: "https://resource-adapter.example/trpc/v1",
});

<ResourceAdapterDialog
  capabilities={capabilities.capabilities}
  getToken={getToken}
  isOpen={true}
  lesson={lesson}
  onClose={() => {}}
  trpcEndpoint="https://resource-adapter.example/trpc/v1"
/>;
```

## Local database

PostgreSQL, accessed through Drizzle. `DATABASE_URL` is read from the process
environment or the root `.env`. Run `pnpm doppler:pull:dev` first (see
Prerequisites), then point it at any local PostgreSQL instance you control and
build the schema:

```sh
pnpm db:reset          # drops and recreates the local schema, then migrates
```

### Docker alternative (local PostgreSQL)

```sh
pnpm docker:db:bootstrap

pnpm doppler:pull:dev
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
a fixed version group on public npm, versioned with Changesets and published
automatically by [`release.yml`](.github/workflows/release.yml). The step-by-step
pipeline is described in the [release workflow](docs/RELEASE_WORKFLOW.md), the
policy and one-time setup in [development notes](docs/DEVELOPMENT.md), and
testing local changes inside a host app in the
[UI local development workflow](docs/UI_LOCAL_DEVELOPMENT.md).
