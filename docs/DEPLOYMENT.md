# Deployment

Two Vercel projects, deployed by GitHub Actions rather than by Vercel's Git
integration. [Release process](RELEASE_PROCESS.md) is the process this serves;
the Terraform is in [`infrastructure/project/`](../infrastructure/project/).

## What exists

| Project                        | Root directory | Database | Deployed to                  |
| ------------------------------ | -------------- | -------- | ---------------------------- |
| `oak-resource-adapter-api`     | `apps/api`     | Yes      | Preview, staging, production |
| `oak-resource-adapter-harness` | `apps/harness` | No       | Preview, staging             |

| Environment    | What it is                                       | Database   |
| -------------- | ------------------------------------------------ | ---------- |
| **Preview**    | One deployment per push, on an unpredictable URL | staging    |
| **`staging`**  | `main`'s deployment, on a fixed domain           | staging    |
| **production** | `production`'s deployment, on the public domain  | production |

Preview and `staging` differ in configuration and durability, never in data —
they share one database. Both sit behind Vercel Authentication; only the
production API domain is public.

Nothing deploys until the repository variable `ENABLE_VERCEL_DEPLOYMENTS` is
exactly `true`. Until then both workflows skip.

## What happens on a pull request

[`deploy-preview.yml`](../.github/workflows/deploy-preview.yml):

1. Applies the branch's migrations to the staging database, so a schema change
   is testable in the Preview that introduces it. [Database](DATABASE.md) has
   the rules that keeps safe.
2. Deploys the API and captures its URL.
3. Deploys the harness, pointed at that URL.
4. Requests `/adapter-proxy/health` on the harness until it answers, which
   passes only if the pair is wired correctly.
5. Runs `pnpm test:e2e:deployment` against the harness.
6. Comments both URLs on the pull request.

Fork and Dependabot pull requests skip all of it: they hold no repository
secrets.

## What happens on `main`

The same workflow and the same steps, targeting the `staging` environment
instead of a Preview, so the deployments land on the staging domains.

## What happens on `production`

[`deploy-production.yml`](../.github/workflows/deploy-production.yml):

1. Applies migrations to the production database.
2. Deploys with `--skip-domain`, so the deployment exists but holds no traffic.
3. Checks it: `/health`, and a tRPC probe that must answer 412.
4. Promotes it onto the production domain.

A failure at any point leaves the live deployment untouched. The project also
sets `auto_assign_custom_domains = false`, so nothing else can take the domain
first.

The browser suite does not run here. It needs a harness pointed at the API under
test, and the production API refuses harness origins by design.

## How the Preview pair is wired

Every Preview produces two deployments whose URLs are unknown until they exist,
and both sit behind Vercel Authentication. Three things make the pair work.

**The harness proxies to the API.** The harness page talks only to its own
origin, under `/adapter-proxy`, and
[`route.ts`](../apps/harness/app/adapter-proxy/%5B...path%5D/route.ts) forwards
server-side to `RESOURCE_ADAPTER_API_ORIGIN`. The browser therefore needs no
credential for the API, and the deployment-safe tests need to reach one origin
rather than two.

**Three values are set per deployment**, because they differ every time and no
static configuration could hold them:

| Value                                | Set on                 | Which secret              |
| ------------------------------------ | ---------------------- | ------------------------- |
| `RESOURCE_ADAPTER_API_ORIGIN`        | The harness deployment | n/a                       |
| `RESOURCE_ADAPTER_API_BYPASS_SECRET` | The harness deployment | The **API** project's     |
| `VERCEL_AUTOMATION_BYPASS_SECRET`    | The test job           | The **harness** project's |

The bypass secret is per project, and Vercel injects one called
`VERCEL_AUTOMATION_BYPASS_SECRET` into every project holding that project's own.
The proxy reads a differently named variable because the harness's own secret
opens nothing on the API.

**The API has to trust the harness origin**, because Clerk checks the token's
`azp` claim against `authorizedParties`:

- Preview: `RESOURCE_ADAPTER_ALLOWED_ORIGIN_PATTERNS` set to
  `https://oak-resource-adapter-harness-*.vercel.thenational.academy`.
  [`cors.ts`](../apps/api/src/cors.ts) discards any pattern not ending in
  `.thenational.academy`, so configuration alone cannot point it at a public
  suffix such as `vercel.app`.
- Staging: the harness answers on a fixed domain, so list it exactly in
  `RESOURCE_ADAPTER_ALLOWED_ORIGINS`.
- Production: neither. `cors.ts` ignores patterns when `VERCEL_ENV` is
  `production`, where OWA is the only caller.

## How the database is reached

Two different routes, neither holding a long-lived credential.

**CI, to run migrations.** [`db-migrate.yml`](../.github/workflows/db-migrate.yml)
is the only way migrations reach a deployed database. It runs Cloud SQL Proxy as
a separate process and connects over `127.0.0.1`, authenticating with Workload
Identity Federation, so there is no CI egress IP to allowlist. Each GitHub
Environment supplies the instance connection name, the identity provider and the
service account as variables, and a `MIGRATION_DATABASE_URL` already pointing at
the proxy as its one secret.

**The deployed API, to serve requests.**
[`cloud-sql.ts`](../packages/db/src/cloud-sql.ts) uses the Cloud SQL Node
connector in-process. Vercel mints a short-lived OIDC token per request, GCP's
Security Token Service exchanges it for an access token, and the connector opens
an mTLS tunnel to the instance. Authentication is IAM, so there is no database
password anywhere.

Both are dormant until `CLOUD_SQL_INSTANCE_CONNECTION_NAME` is set. Without it,
everything connects from `DATABASE_URL` — which is what local development, CI
and the integration tests do.

The connector needs an async handshake before its first query, while
`getDatabaseClient()` is called synchronously from a dozen query sites. So
`initialiseDatabaseClient()` does that work once from
[`instrumentation.ts`](../apps/api/instrumentation.ts), and `getDatabaseClient()`
throws rather than silently falling back if a Cloud SQL deployment queries before
it has run.

## Secrets the workflows use

Terraform owns project shape, domains, protection and every Vercel environment
variable — see [`locals.tf`](../infrastructure/project/locals.tf), which is where
each value's destination is decided.

What the workflows need for themselves they hold as repository secrets. The first
six are readable from the Terraform workspace outputs:

| Secret                              | Purpose                                |
| ----------------------------------- | -------------------------------------- |
| `VERCEL_TOKEN`                      | Deploy and promote                     |
| `VERCEL_ORG_ID`                     | Team scope                             |
| `VERCEL_PROJECT_ID_API`             | Which project the API step deploys     |
| `VERCEL_PROJECT_ID_HARNESS`         | Which project the harness step deploys |
| `VERCEL_API_BYPASS_SECRET`          | Reaching the protected API             |
| `VERCEL_HARNESS_BYPASS_SECRET`      | Reaching the protected harness         |
| `CLERK_SECRET_KEY`                  | Signing the browser suite in           |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | The same                               |
| `E2E_CLERK_USER_EMAIL`              | The same                               |

The three Clerk values must belong to the instance the deployed harness verifies
against, or the suite dies at sign-in. Migrations take their credentials from the
GitHub Environment instead; see
[development notes](DEVELOPMENT.md#how-ci-reads-secrets).
