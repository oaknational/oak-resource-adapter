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

## Prerequisites

- Node.js 24 LTS (see `.nvmrc`)
- pnpm 10 or later

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
```

Run `pnpm exec playwright install chromium` once before the first browser test.

## Local harness

The harness is an OWA-like local host for the published UI boundary.

```sh
pnpm dev
```

This starts the harness on port 3000 and the local API on port 3001. The harness page
uses the workspace UI package's typed client to resolve capabilities, then
renders the package-owned drawer with representative lesson context. This
mirrors the OWA/package composition boundary.

## API client

The service API uses tRPC. The published UI package includes its typed
client, which can also be used directly by OWA or another host, such as the harness:

```ts
import { createResourceAdapterClient } from "@oaknational/resource-adapter/client";

const api = createResourceAdapterClient({
  getToken,
  trpcEndpoint: "https://resource-adapter.example/trpc/v1",
});
const capabilities = await api.capabilities.get.query(lesson);
```

## Local database

Use a local PostgreSQL database. Copy `.env.example` to `.env`, set
`DATABASE_URL`, then run:

```sh
pnpm db:generate
pnpm db:migrate:dev
```

## Migration Guidance

- Migration SQL is committed and reviewed alongside code.
- Do not edit a migration after it has been applied to a shared environment.
- Make changes in additive, backwards-compatible steps where a rollout needs more than one release.

## Migration Commands

In development, run `pnpm db:migrate:dev` to update your local database.

> Staging and production deployments must run `pnpm db:migrate:deploy` as a
> dedicated CI job before the API deployment.

## Release Versioning

`@oaknational/resource-adapter` and its contracts package are preconfigured to
release as a fixed version group; OWA will depend only on the UI package. Until
the first publish, contributors do not need to add Changesets. See [release
management](.changeset/README.md) for the later release steps, including the
single repository setting that enables enforcement.
