# Moderation

`@oaknational/resource-adapter-moderation` calls the
[Oak AI Moderation Service](https://github.com/oaknational/oak-ai-moderation-service)
(`POST /v1/moderate`). Every scaffold a model generates is moderated before the
teacher sees it ([scaffold moderation](#scaffold-moderation)).

## Outcomes

`moderate` never throws for anything the service or the network does. It returns
`PASSED`, `FLAGGED` or `FAILED`, so a caller that could not moderate has to decide
what that means for safety.

- `FLAGGED` carries the service's own `flagged_categories`. The service owns the
  thresholds; ORA does not re-derive them from the scores.
- A category code ORA does not know goes in `unrecognisedCategories` and still
  counts as flagged.
- Scores run from 5 (not involved) down to 1 (heavily involved). Low is bad. A
  score that is missing, out of range or for an unknown category is left out
  rather than failing the response, as are a missing `prompt_version` and
  `moderation_id`.

| Upstream                                                   | Reason                 |
| ---------------------------------------------------------- | ---------------------- |
| 400                                                        | `INVALID_REQUEST`      |
| 401                                                        | `NOT_AUTHENTICATED`    |
| 403                                                        | `NOT_AUTHORISED`       |
| 504, or no answer within 35s                               | `TIMED_OUT`            |
| Any other non-2xx, or a network failure                    | `UPSTREAM_UNAVAILABLE` |
| A 2xx body that is not JSON or has no `flagged_categories` | `MALFORMED_RESPONSE`   |
| The caller's `AbortSignal` fired                           | `ABORTED`              |

HTTP failures keep their status code in `cause` as a `ModerationHttpError`. There
is no automatic retry; the caller decides.

## Scaffold moderation

The apply and retry jobs moderate a scaffold after the model's output is applied
and before anything is stored. Only the nodes the scaffold added are sent, as
plain text without the worksheet title. `safetyResultOf` classifies the flagged
codes by prefix, as Aila does, so a code ORA does not know yet still counts by
its group:

| Result              | Codes               | What happens                                                                |
| ------------------- | ------------------- | --------------------------------------------------------------------------- |
| `toxic`             | any `t/`            | Withheld: the attempt completes, the head stays put, the teacher can retry  |
| `highly-sensitive`  | otherwise, any `n/` | Withheld, as above                                                          |
| `guidance-required` | otherwise, any code | Shown, with the flagged areas named until the teacher accepts it            |
| `safe`              | none                | Shown                                                                       |
| `FAILED` outcome    | n/a                 | The job step throws, Workflow retries it, then the job fails with Try again |

The result and the codes are stored on `transformation_attempts`. A scaffold
with no text throws rather than passing. Neither the text nor the service's
reply is logged or put in an error message.

### Deterministic moderation

`MODERATION_TRANSPORT=deterministic` replaces the service with a fake that never
makes a network call, the way `MODEL_TRANSPORT=deterministic` replaces the model.
CI browser tests use both. Production refuses it, and readiness reports
`DETERMINISTIC_MODERATION_FORBIDDEN`. Unset or `service` calls the service and
needs `MODERATION_API_URL`.

The fake decides from trigger text that the deterministic model's canned
scaffolds carry, so each scaffold always reaches the same result:

| Scaffold                              | Result                              |
| ------------------------------------- | ----------------------------------- |
| Add a word bank, Add recall questions | `safe`                              |
| Add a word bank with definitions      | `guidance-required` (Bunsen burner) |
| Add a task glossary                   | `highly-sensitive`                  |
| Add sentence starters                 | `toxic`                             |
| Add sentence frames                   | `FAILED`                            |

The triggers live in `apps/api/src/moderation/deterministic-moderator.ts`.
Because the text never changes, a retry reaches the same result as the first
attempt; a result that changes between attempts is covered by unit tests.

A browser test must not apply Add sentence frames for real. The failed job makes
the Workflow SDK log a `FatalError`, which fails the CI browser job's log check,
so the failure test writes the failed state into the API's responses instead.

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
