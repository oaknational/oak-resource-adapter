# Database

PostgreSQL, accessed through [Drizzle](https://orm.drizzle.team). Schema,
migrations and the shared client live in [`packages/db`](../packages/db/).

## Commands

Note that `db:generate` writes a migration file; it does not create a database.

| Command                  | What it does                                         |
| ------------------------ | ---------------------------------------------------- |
| `pnpm db:reset`          | Drops and recreates the local schema, then migrates. |
| `pnpm db:generate`       | Diffs the schema and writes a new migration.         |
| `pnpm db:migrate:dev`    | Applies pending migrations locally.                  |
| `pnpm db:migrate:deploy` | Applies pending migrations to a deployed database.   |
| `pnpm db:check`          | Checks the migration history for collisions.         |
| `pnpm db:studio`         | Opens Drizzle Studio.                                |

`DATABASE_URL` is read from the process environment or the root `.env`.
`db:reset` refuses any host but localhost.

## Changing the schema

Edit [`packages/db/src/schema/`](../packages/db/src/schema/), run
`pnpm db:generate`, read the SQL, then `pnpm db:migrate:dev`. Commit the schema
change and the generated `drizzle/` files together — CI regenerates migrations
and fails if that produces anything uncommitted.

Do not edit a migration that has been applied to a shared environment. Where a
change needs more than one release, make it additive.

## Migrating a live database

`db:migrate:deploy` applies what is pending and is otherwise a no-op.

- **All pending migrations run in one transaction**, so a failure rolls the whole
  batch back and there is no partial state to repair.
- **`CREATE INDEX CONCURRENTLY` therefore cannot be used** — PostgreSQL forbids it
  inside a transaction. On a large live table it needs applying outside the normal
  migration path, because a plain `CREATE INDEX` holds a write lock throughout.
- An **advisory lock** stops two deployments migrating at once, bounded by
  `MIGRATION_LOCK_WAIT_SECONDS` (default 120).
- **`MIGRATION_LOCK_TIMEOUT`** (default `10s`) caps how long DDL waits for a table
  lock, so a migration queued behind a long query fails instead of blocking every
  query on that table.

## The schema

```text
generations                        the teacher's request
  └─ generation_attempts           one execution; exactly one job
      ├─ attempt_input_resource_documents ──→ resource_documents   what it read
      ├─ model_invocations ──→ prompt_templates              each model call it made
      └─ resource_documents (via generation_attempt_id)      what it produced
              └─ resource_artifacts                          PDF, Word
```

The important cross-table relationships are:

**A generation is the teacher's request; an attempt is one try at fulfilling it.**
Retrying the same request creates a new attempt with its own job. This lets a
teacher ask for another result from the same request while preserving each try
separately.

**An attempt has input documents and output documents, but the two relationships
work differently.** A generated output belongs to exactly one attempt, so the
document stores its `generation_attempt_id` directly. An input can be read by
many attempts, and each attempt can read any number of inputs, so
`attempt_input_resource_documents` records that many-to-many relationship. Inputs
and outputs both have a position, making prompt assembly and returned results
reproducible.

**A document's `origin` says where it originally came from, not how it is being
used.** For example, a generated worksheet can later become an input to another
attempt. Input usage is therefore recorded separately in
`attempt_input_resource_documents`.

**Prompt templates live in source-controlled code, not in the database.** The
database keeps an immutable copy of each compiled prompt that was actually used,
allowing every model invocation to reference its exact prompt. Identical compiled
prompts are reused by content hash.

## Deletion

These rules apply when the row referenced by each foreign key is deleted:

| Foreign key                                              | Result     | Why                                                         |
| -------------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `generation_attempts.generation_id`                      | `CASCADE`  | Attempts are owned by the request.                          |
| `generation_attempts.job_id`                             | `RESTRICT` | The job is the audit record of work performed.              |
| `attempt_input_resource_documents.generation_attempt_id` | `CASCADE`  | Edges are owned by the attempt.                             |
| `attempt_input_resource_documents.resource_document_id`  | `RESTRICT` | A surviving attempt must not silently lose provenance.      |
| `model_invocations.generation_attempt_id`                | `CASCADE`  | Invocations are owned by the attempt.                       |
| `model_invocations.prompt_template_id`                   | `RESTRICT` | Which prompt produced an output must outlive cache tidying. |
| `resource_documents.generation_attempt_id`               | `CASCADE`  | A generated document is owned by its attempt.               |
| `resource_artifacts.resource_document_id`                | `CASCADE`  | An export is owned by its document.                         |

Deleting a generation normally deletes its attempts, model invocations, generated
documents and artifacts. If one of those generated documents has since become an
input to another attempt, PostgreSQL refuses the deletion so that provenance is
not silently lost. Shared jobs, Oak resource documents and prompt templates are
not deleted.

## Data protection

Content lives in `resource_documents.document` and `model_invocations.request` /
`.response`. A request inlines the source document and any free text the teacher
supplied, so that content exists in more than one place per attempt. Failures
record classified metadata rather than a raw provider error, which can carry
prompt content. `clerk_user_id` is a pseudonymous reference to Clerk; no names or
email addresses are stored.

Retention and deletion jobs are not yet implemented. Cascading a
`resource_artifacts` row removes the database record, not the stored object; a
deletion job must remove its `storage_key` from storage as well.
