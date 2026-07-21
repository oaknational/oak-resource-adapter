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

This starts the harness on port 3000 and the local API on port 3001. The page renders
`ResourceAdapterButton` and `ResourceAdapterDialog` from the workspace UI
package with representative lesson context and a response from the API to
mirror the OWA integration.

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
