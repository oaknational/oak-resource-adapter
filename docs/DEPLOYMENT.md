# Deployment

Two Vercel projects, both deployed by workflow rather than by Vercel's Git
integration. [`docs/RELEASE_PROCESS.md`](RELEASE_PROCESS.md) is the process this
serves; this document is how it is built.

| Project                        | Root directory | Database | Deployed to                  |
| ------------------------------ | -------------- | -------- | ---------------------------- |
| `oak-resource-adapter-api`     | `apps/api`     | Yes      | Preview, staging, production |
| `oak-resource-adapter-harness` | `apps/harness` | No       | Preview, staging             |

| Branch           | Reaches                   | Deployed by                                                           |
| ---------------- | ------------------------- | --------------------------------------------------------------------- |
| Feature branches | A Preview pair            | [`deploy-preview.yml`](../.github/workflows/deploy-preview.yml)       |
| `main`           | The `staging` environment | The same workflow                                                     |
| `production`     | The production API domain | [`deploy-production.yml`](../.github/workflows/deploy-production.yml) |

Every Preview migrates the shared staging database before it deploys, so a
schema change is testable in the Preview that introduces it.
[Database](DATABASE.md#changing-the-schema) sets out what keeps that safe — the
rules matter, because one pull request's migration is visible to every other
Preview.

Terraform for the projects is in
[`infrastructure/project/`](../infrastructure/project/), which also lists what
Cloud still has to confirm.

## Three things called staging

| Term                     | What it is                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| **A Preview**            | One deployment per push, on a URL nobody can predict. Every branch gets them.               |
| **`staging`**            | A Vercel custom environment: `main`'s deployment, on a fixed domain, with its own env vars. |
| **The staging database** | The single non-production database. Previews and `staging` all share it.                    |

A Preview and `staging` differ in configuration and durability, never in data.
Calling any non-production deployment "staging" is harmless shorthand right up
until someone assumes it has its own database.

QA works in each pull request's own Preview, and again in the release branch's,
so `main` is not a QA gate. `staging` exists because OWA needs a stable adapter
API origin to integrate against, and because [release process
step 1](RELEASE_PROCESS.md) otherwise has no fixed deployment to check.

## Nothing runs until the switch is set

Both workflows skip unless the repository variable `ENABLE_VERCEL_DEPLOYMENTS`
is exactly `true`. Setting it is the only step between this configuration
existing and deployments happening.

## Why not the Git integration

`apps/api/vercel.json` and `apps/harness/vercel.json` both set
`git.deploymentEnabled` to `false`.

A harness deployment is inert until it is told which API deployment to talk to,
and every Preview gets an unpredictable URL. Only a workflow that has just
deployed the API knows that URL, so a Git-triggered harness Preview would point
at nothing. Turning Git deployments off also means the harness never builds for
production, and that a merge to `production` deploys exactly once.

## How a Preview pair is wired

`deploy-preview.yml` deploys the API, captures its URL, then deploys the harness
with that URL as `RESOURCE_ADAPTER_API_ORIGIN`. The harness page uses relative
paths under `/adapter-proxy`, so the browser only ever touches the harness
origin and the API's bypass credential never reaches a client bundle.

Both deploy on every push, even when only one app changed: the harness carries
its API's URL, so skipping a build leaves a pair pointing at the previous
deployment. `turbo-ignore` and `ignore_command` cannot help — Ignored Build Step
mechanisms only apply to Git-triggered builds.

Three values make that work, and two of them are easy to confuse:

| Value                                | Set on                 | Which secret              |
| ------------------------------------ | ---------------------- | ------------------------- |
| `RESOURCE_ADAPTER_API_ORIGIN`        | The harness deployment | n/a                       |
| `RESOURCE_ADAPTER_API_BYPASS_SECRET` | The harness deployment | The **API** project's     |
| `VERCEL_AUTOMATION_BYPASS_SECRET`    | The test job           | The **harness** project's |

The bypass secret is per project. Vercel injects a variable called
`VERCEL_AUTOMATION_BYPASS_SECRET` into every project holding that project's own
secret, which is why the proxy in
[`route.ts`](../apps/harness/app/adapter-proxy/%5B...path%5D/route.ts) reads a
differently named variable: the harness's own secret opens nothing on the API.

The API separately has to trust the harness origin, because Clerk checks the
token's `azp` claim against `authorizedParties`. That is
`RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS`, a static value per environment
rather than something the workflow sets:

- Preview: `https://oak-resource-adapter-harness-*.vercel.thenational.academy`.
  A wildcard is only safe over a zone Oak controls, and
  [`cors.ts`](../apps/api/src/cors.ts) discards any pattern that does not end in
  `.thenational.academy` so configuration alone cannot point it at a public
  suffix such as `vercel.app`.
- Staging: the harness's staging deployment answers on its own custom domain, so
  list that domain exactly in `RESOURCE_ADAPTER_ALLOWED_ORIGINS` instead.
- Production: neither. `cors.ts` ignores patterns entirely when `VERCEL_ENV` is
  `production`, where OWA is the only caller and its origin is known.

## Staged production

`deploy-production.yml` migrates, deploys with `--skip-domain`, checks the
deployment while it holds no traffic, and only then promotes it. A failure at
any point leaves the live deployment untouched. The project also sets
`auto_assign_custom_domains = false`, so nothing else can take the domain first.

The checks are `/health` and a tRPC probe, both from the runner. The browser
suite cannot run here: it needs a harness pointed at the API under test, and the
production API refuses harness origins by design.

## Who owns which environment variable

**Doppler owns every Vercel environment variable.** Terraform passes none, and
owns project shape, domains and protection instead. This is the same split
`oak-ai-lesson-assistant` uses for its Doppler-synced Vercel project.

Proposed Doppler configs, to be agreed before they are created — the harness has
no production config because it is never deployed there:

| Config               | Syncs to                                            |
| -------------------- | --------------------------------------------------- |
| `prd_vercel_api`     | `oak-resource-adapter-api`, production              |
| `stg_vercel_api`     | `oak-resource-adapter-api`, preview and staging     |
| `stg_vercel_harness` | `oak-resource-adapter-harness`, preview and staging |

Whether the Doppler integration can target a Vercel **custom environment** is
still unconfirmed, and no other Oak repository has needed it — Aila syncs
Doppler but has no custom environments, and the moderation service has one but
no Doppler. If it cannot, `staging` values move into Terraform's
`custom_env_vars` and the split above holds for Preview and Production only.

The three values in the pairing table above are the exception: they differ per
deployment, so the workflow passes them with `vercel deploy --env`.

### Four that are easy to get wrong

**The harness and the browser tests must share one Clerk instance.** The tests
sign in with the credentials in `stg_github`; the deployed harness verifies that
session with the publishable key in `stg_vercel_harness`. If those two configs
point at different Clerk instances the deployment-safe suite fails at sign-in,
looking like a broken deployment rather than a mismatched key.

**`SENTRY_DSN` is required in every Vercel config, not just production.**
[`initSentry`](../apps/api/src/sentry/init.ts) throws when the DSN is missing
under `NODE_ENV=production`, and Vercel builds every deployment that way —
Preview and staging included. Omit it from the Preview config and every API
Preview fails on boot.

**`ENABLE_DEV_ROUTES` belongs in Preview and staging only**, because the harness
posts to the unauthenticated `/dev` routes.
[`devRoutesEnabled`](../apps/api/src/dev-routes.ts) opens them only for an
explicit affirmative, so leaving it out of the production config and writing
`0` there both close them.

**`SENTRY_AUTH_TOKEN` does not exist yet.** Source maps go unuploaded until it
does, so production stack traces stay minified.

## Secrets the workflows need

Repository secrets, with the Vercel values readable from the Terraform
workspace outputs rather than the dashboard:

| Secret                         | Purpose                                |
| ------------------------------ | -------------------------------------- |
| `VERCEL_TOKEN`                 | Deploy and promote                     |
| `VERCEL_ORG_ID`                | Team scope                             |
| `VERCEL_PROJECT_ID_API`        | Which project the API step deploys     |
| `VERCEL_PROJECT_ID_HARNESS`    | Which project the harness step deploys |
| `VERCEL_API_BYPASS_SECRET`     | Reaching the protected API             |
| `VERCEL_HARNESS_BYPASS_SECRET` | Reaching the protected harness         |

`DOPPLER_TOKEN` is already in place; see
[development notes](DEVELOPMENT.md#how-ci-reads-secrets).

## How migrations reach the database

[`db-migrate.yml`](../.github/workflows/db-migrate.yml) connects through Cloud
SQL Proxy on `127.0.0.1`, authenticated with Workload Identity Federation, so
there is no key to rotate and no CI egress IP to allowlist. Doppler supplies
`CLOUD_SQL_INSTANCE_CONNECTION_NAME`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
`GCP_SERVICE_ACCOUNT`, and a `DATABASE_URL` already pointing at the proxy. The
proxy steps are skipped while the instance name is empty, so the workflow is
unchanged until Cloud provisions the service account.

This says nothing about how the Vercel runtime reaches the database, which needs
its own route. The two are easy to conflate.
