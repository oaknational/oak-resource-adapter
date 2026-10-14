# Moderation

`@oaknational/resource-adapter-moderation` calls the
[Oak AI Moderation Service](https://github.com/oaknational/oak-ai-moderation-service)
(`POST /v1/moderate`). Nothing in the transformation pipeline calls it yet.

## Outcomes

`moderate` never throws for anything the service or the network does. It returns
`PASSED`, `FLAGGED` or `FAILED`, so a caller that could not moderate has to decide
what that means for safety.

- `FLAGGED` carries the service's own `flagged_categories`. The service owns the
  thresholds; ORA does not re-derive them from the scores.
- A category code ORA does not know goes in `unrecognisedCategories` and still
  counts as flagged.
- Scores run from 5 (not involved) down to 1 (heavily involved). Low is bad.

| Upstream                                  | Reason                 |
| ----------------------------------------- | ---------------------- |
| 400                                       | `INVALID_REQUEST`      |
| 401                                       | `NOT_AUTHENTICATED`    |
| 403                                       | `NOT_AUTHORISED`       |
| 504, or no answer within 35s              | `TIMED_OUT`            |
| Any other non-2xx, or a network failure   | `UPSTREAM_UNAVAILABLE` |
| A 2xx body that does not match the schema | `MALFORMED_RESPONSE`   |
| The caller's `AbortSignal` fired          | `ABORTED`              |

HTTP failures keep their status code in `cause` as a `ModerationHttpError`. There
is no automatic retry; the caller decides.

## Authentication

| Environment                  | `MODERATION_API_URL`                                 | `MODERATION_API_BYPASS_SECRET` |
| ---------------------------- | ---------------------------------------------------- | ------------------------------ |
| Preview, staging, production | `https://moderation-api.thenational.academy`         | not set                        |
| Local development            | `https://moderation-api-preview.thenational.academy` | set                            |

Deployments send their Vercel OIDC token. The moderation service checks it
against its `ALLOWED_VERCEL_PROJECTS` allowlist, which must name
`oak-resource-adapter-api`. 401 and 403 mean that allowlist or the OIDC wiring is
wrong.

There is no OIDC token off a deployment, so local development calls the
non-production deployment instead. That deployment checks no identity, but sits
behind Vercel Deployment Protection, which the bypass secret gets past. A missing
or wrong secret locally shows up as a 401.

The deployed URL is a Terraform Cloud workspace value in `env_vars`. The bypass
secret is local only and stays out of Terraform.

## Local setup

Both variables are in the Doppler `dev` config, so regenerating `.env` (see the
[README](../README.md#getting-started)) picks them up.

- Live smoke test, by hand only:
  `doppler run --project oak-resource-adapter --config dev -- pnpm --filter @oaknational/resource-adapter-moderation smoke:moderation`
- End to end: run `pnpm dev`, open the harness at `?view=smoke-tests` and run the
  moderation test. It calls the dev-gated `POST /dev/moderation/moderate`, which
  accepts only `expected-pass` (the flattened `linear-equations-smoke` fixture)
  and `expected-flag` (a committed sentence about practical equipment), never
  free text.
