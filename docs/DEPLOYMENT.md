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
5. Gates on `/adapter-proxy/health/ready`.
6. Runs `pnpm test:e2e:deployment` against the harness.
7. Comments both URLs on the pull request.

Fork pull requests skip all of it: they hold no repository secrets. Dependabot
pull requests are skipped explicitly; they read the separate [Dependabot secret
store](#secrets-the-workflows-use), which holds no Vercel credentials.

## What happens on `main`

The same workflow and the same steps, targeting the `staging` environment
instead of a Preview, so the deployments land on the staging domains.

## What happens on `production`

[`deploy-production.yml`](../.github/workflows/deploy-production.yml):

1. Applies migrations to the production database.
2. Deploys with `--skip-domain`, so the deployment exists but holds no traffic.
3. Checks `/health`, `/health/ready`, and a tRPC probe that must answer 412.
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

Two routes are in use, one per caller.

**CI, to run migrations.** [`db-migrate.yml`](../.github/workflows/db-migrate.yml)
is the only way migrations reach a deployed database. It runs Cloud SQL Proxy as
a separate process and connects over `127.0.0.1`. The proxy authenticates to
Google Cloud with Workload Identity Federation, so there is no CI egress IP to
allowlist or service-account key to rotate. PostgreSQL authentication still uses
the migration user's password. Each GitHub Environment supplies the instance
connection name, identity provider and service account as variables, and a
`MIGRATION_DATABASE_URL` pointing at the proxy and holding that password as its
one secret.

**The deployed API, to serve requests.** A direct TLS connection to the
instance's public address, from the static egress IPs allowlisted on it.
`DATABASE_URL` carries the application user and its password;
`DATABASE_CA_CERT` carries the instance's certificate authority, which is what
identifies the server under the instances' `GOOGLE_MANAGED_INTERNAL_CA` mode.
Shared CA modes require hostname verification as well.
[`client.ts`](../packages/db/src/client.ts) refuses any host but loopback
without it, so a misconfiguration cannot become an unverified connection across
the public internet. Terraform sets the two together or not at all.

With `DATABASE_CA_CERT` set, `DATABASE_URL` accepts no query parameters: supply
the address, database and percent-encoded credentials, without `sslmode` or other
options. TLS is configured by the client.

`DATABASE_CA_CERT` accepts concatenated PEM certificates. Before a CA rotation,
set it to trust both the outgoing and incoming authorities and redeploy every
deployment that must remain usable, including Previews. Existing deployments
retain their old environment values. After rotation, remove the outgoing CA
and redeploy again.

Static IPs are a project setting covering every environment, so Preview and
production deployments leave from the same addresses: it is the credentials, not
the allowlist, that keep a Preview off the production database. Build traffic
routes through them only when the project opts in, so nothing may query the
database at build time.

Local development, CI and the integration tests set only `DATABASE_URL`, and it
addresses localhost.

Both deploy workflows gate on `/health/ready`. Its database `select 1` checks
connectivity and authentication, not migrations or application-table grants.
Configuration, certificate and authorization failures stop the gate; network
and unknown failures are retried. Check the allowlist for an unreachable host.
Responses and logs use fixed messages without driver error text.

Setting `CLOUD_SQL_INSTANCE_CONNECTION_NAME` selects the Vercel OIDC/Cloud SQL
connector in [`cloud-sql.ts`](../packages/db/src/cloud-sql.ts). Leave it unset
for direct connections. The connector requires the complete federation and IAM
database configuration and is initialised asynchronously by
[`instrumentation.ts`](../apps/api/instrumentation.ts); it never falls back to
`DATABASE_URL` on failure.

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

The same three Clerk values are duplicated into the repository's Dependabot
secret store, which is all a Dependabot-triggered run can read, so
`Run browser tests` runs on Dependabot pull requests instead of skipping. Both
copies must be test-instance credentials, never production.
