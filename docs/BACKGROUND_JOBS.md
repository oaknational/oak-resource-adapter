# Background jobs

The API and background worker are two halves of the same service. They live in
`apps/api`, build together, and are intended to deploy in one Vercel project.
Vercel Workflow supplies durable execution in hosted environments; its Local
World runs the identical workflow and step functions as part of `pnpm dev`.

## The database owns product state

`jobs` is the durable, product-facing record with a limited lifecycle:

```text
queued -> running -> succeeded
                  \-> failed
```

The row contains:

- an opaque, unique `idempotency_key`;
- an optional `concurrency_key` for work that must not overlap;
- `counts_against_clerk_user_id`, set only on a job that invokes a model;
- an open-ended string `kind`;
- the lifecycle status and timestamps;
- validated JSON `input`;
- the Workflow run ID for operational correlation; and
- safe failure code and message fields.

Workflow owns delivery, step retries, and the internal sequence of a pipeline.

Starting a job is idempotent: using the same key with the same kind and input
returns the original job. The workflow claims a queued row atomically, so
duplicate deliveries cannot both run it. Retrying a request also redispatches
an original row that was persisted but still has no Workflow run ID.

Different requests may share a concurrency key. While one is queued or running,
another resolves to that active job instead of starting in parallel. Succeeded
and failed jobs release the key automatically. Idempotency therefore identifies
one request; concurrency groups distinct requests that must run one at a time.

## Usage limits

A job that invokes a model counts towards its teacher's rolling allowance:
`USAGE_LIMIT_MODEL_JOBS_PER_24H` jobs in a rolling 24 hours, or 100 when unset. The
limit is checked only when an enqueue would insert a row, so a replay or a
request that collides with running work is never refused. A refused enqueue
writes nothing and returns `usageLimitReached`, which the worksheet state carries as
`modelWorkBlocked`. Its `kind` identifies the policy (`model_jobs_24h`) and
`retryAt` is when another job may fit, not when the whole allowance resets.

Each admitted job counts once, including failed jobs; invocations and execution
retries within it do not count separately.

## Durable outputs

Job outcomes belong in their domain tables, not on the job. A `transformation_attempts`
row references exactly one job while the job remains independent of product
tables. Its input, invocation, document and artifact relationships are described
in [database](DATABASE.md).

## Adding a job kind

1. Give the job its own directory under `apps/api/src/jobs`, containing its
   definition, strict input schema, and Workflow steps.
2. Set `invokesModel` on the definition. When it is true, the enqueue requires
   the teacher's ID and the job counts towards their usage limit.
3. Register the definition in `registry.ts`. The `kind` remains a string in
   PostgreSQL while the registry gives application code a discriminated union.
4. Add its executor to the typed map in `workflows/run-job.ts`.
5. Put work with side effects in `"use step"` functions. Steps can represent a
   real pipeline; they do not require child job rows. External writes must use
   an idempotency key that remains stable across retries (normally Workflow's
   step ID).
6. Persist durable output in its proper domain table and relationship.

Unknown kinds fail safely rather than being guessed or silently accepted.

## Local smoke test

Build the schema, start the repository, then create a dummy job:

```sh
pnpm db:reset
pnpm dev

curl --request POST http://localhost:3001/dev/jobs/test-echo \
  --header 'content-type: application/json' \
  --data '{"message":"hello worker"}'
```

Poll the `id` returned by that request:

```sh
curl http://localhost:3001/dev/jobs/<job-id>
```

These convenience routes support the development and staging harnesses. They are
not a public API contract and can be replaced by the authenticated generation API
when that contract is designed.

Every route under `/dev` returns 404 unless `ENABLE_DEV_ROUTES` is `1`, `true`,
`yes` or `on`, so the smoke test above needs it in your `.env`. Anything else,
including `0` and `false`, leaves them closed.
