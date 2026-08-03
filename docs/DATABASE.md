# Database

PostgreSQL, accessed through [Drizzle](https://orm.drizzle.team). Schema,
migrations and the shared client live in [`packages/db`](../packages/db/).

Every table and enum lives in the `resource_adapter` schema rather than `public`.
That name is a contract with Terraform in Oak's `Cloud-Config` repository, which
creates the schema, owns it with the migration user, and grants the application
roles on it. `public` could not be used: since PostgreSQL 15 it grants `CREATE`
only to the database owner, so the migration user would be refused when creating
tables. Drizzle's migration journal lives in `drizzle`, which Terraform also
provisions.

## Commands

Note that `db:generate` writes a migration file; it does not create a database.

| Command                  | What it does                                          |
| ------------------------ | ----------------------------------------------------- |
| `pnpm db:reset`          | Drops and recreates the local schemas, then migrates. |
| `pnpm db:generate`       | Diffs the schema and writes a new migration.          |
| `pnpm db:migrate:dev`    | Applies pending migrations locally.                   |
| `pnpm db:migrate:deploy` | Applies pending migrations to a deployed database.    |
| `pnpm db:check`          | Checks the migration history for collisions.          |
| `pnpm db:studio`         | Opens Drizzle Studio.                                 |

`DATABASE_URL` is read from the process environment or the root `.env`.
`db:reset` refuses any host but localhost.

## Changing the schema

Edit [`packages/db/src/schema/`](../packages/db/src/schema/), run
`pnpm db:generate`, read the SQL, then `pnpm db:migrate:dev`. Commit the schema
change and the generated `drizzle/` files together — CI regenerates migrations
and fails if that produces anything uncommitted.

Declare a new table with `resourceAdapterSchema.table` rather than `pgTable`, and
a new enum with `resourceAdapterSchema.enum`. A bare `pgTable` silently targets
`public`, where the application has no privileges, so it fails only on deploy.

Do not edit a migration that has been applied to a shared environment. Where a
change needs more than one release, make it additive.

A migration must also be safe for the code already deployed: the old code meets
the new schema while a deployment is in progress, and again if it is rolled back.
Dropping or renaming a column, or tightening one to `NOT NULL`, breaks a live
application. Expand first and contract in a later release.

Previews share the staging database, so a migration reaches them only once it is
merged and staging is migrated.

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
adaptations                        a teacher's work on one resource
  ├─ head_resource_document_id ··→ resource_documents   what they see now
  └─ transformations               one requested change
      ├─ transformation_inputs ──→ resource_documents   what it reads
      └─ transformation_attempts   one execution; exactly one job
          ├─ model_invocations ──→ prompt_templates     each model call it made
          ├─ suggested_transformations ──→ resource_documents   what it offered
          └─ resource_documents (via transformation_attempt_id) what it produced
                  └─ resource_artifacts                 PDF, Word
```

The important cross-table relationships are:

**An adaptation is the container; a transformation is one change a teacher asked
for.** In an iterative capability that is one click, and there may be many per
adaptation. A one-shot capability is the same shape with a single transformation.
`capability_id` and `clerk_user_id` live only on the adaptation, so ownership has
exactly one row to check against.

**A transformation is one requested change; an attempt is one try at making it.**
Retrying creates a new attempt with its own job, preserving each try separately.

**Inputs belong to the transformation, outputs to the attempt.** A retry of the
same request reads the same documents, so `transformation_inputs` hangs off the
transformation; each attempt produces its own output, so a generated document
stores its `transformation_attempt_id` directly. Inputs and outputs both have a
position, making prompt assembly and returned results reproducible.

**`head_resource_document_id` is what the teacher currently sees**, and undo and
redo move it, so no separate history table is needed yet.

Its foreign key closes a cycle: the adaptation points down at a document that
points back up through its attempt and transformation. That is a reference into an
owned subtree rather than shared ownership, so PostgreSQL handles it — tidying
document history cannot orphan an adaptation, while deleting the adaptation still
cascades through to the same documents. Being current cannot instead be a flag on
the document, because a head can be a shared Oak resource document.

**A suggested transformation is a change the model offered.** Accepting one
creates a transformation of the same kind, recorded in
`accepted_transformation_id`; a row where that is null was offered and ignored,
which is how the suggestion model is evaluated. Offers are keyed to a document
version, so moving the head back reveals the offers that version already had.
`kind` on both tables keys into the same TypeScript registry, and
`target_block_id` references a block inside the document envelope, so it has no
foreign key.

**A document's `origin` says where it originally came from, not how it is being
used.** For example, a generated worksheet can later become an input to another
transformation. Input usage is therefore recorded separately in
`transformation_inputs`.

**Prompt templates live in source-controlled code, not in the database.** The
database keeps an immutable copy of each template that was actually used, so
every model invocation can reference the exact prompt it was rendered from.
Templates are reused by content hash, which covers the identifier and version
alongside the body.

The stored template is the body with its `{{placeholders}}` intact, not the text
that was sent. The rendered text, with the teacher's content substituted in,
lives in `model_invocations.request`.

## Deletion

These rules apply when the row referenced by each foreign key is deleted:

| Foreign key                                            | Result     | Why                                                           |
| ------------------------------------------------------ | ---------- | ------------------------------------------------------------- |
| `adaptations.head_resource_document_id`                | `RESTRICT` | An adaptation must not be left pointing at nothing.           |
| `transformations.adaptation_id`                        | `CASCADE`  | Transformations are owned by the adaptation.                  |
| `transformation_attempts.transformation_id`            | `CASCADE`  | Attempts are owned by the request.                            |
| `transformation_attempts.job_id`                       | `RESTRICT` | The job is the audit record of work performed.                |
| `transformation_inputs.transformation_id`              | `CASCADE`  | Edges are owned by the transformation.                        |
| `transformation_inputs.resource_document_id`           | `RESTRICT` | A surviving transformation must not silently lose provenance. |
| `model_invocations.transformation_attempt_id`          | `CASCADE`  | Invocations are owned by the attempt.                         |
| `model_invocations.prompt_template_id`                 | `RESTRICT` | Which prompt produced an output must outlive cache tidying.   |
| `resource_documents.transformation_attempt_id`         | `CASCADE`  | A generated document is owned by its attempt.                 |
| `resource_artifacts.resource_document_id`              | `CASCADE`  | An export is owned by its document.                           |
| `suggested_transformations.resource_document_id`       | `CASCADE`  | Offers describe one document version.                         |
| `suggested_transformations.transformation_attempt_id`  | `CASCADE`  | Offers are owned by the attempt that produced them.           |
| `suggested_transformations.accepted_transformation_id` | `SET NULL` | The offer is still a record of what was shown.                |

Deleting an adaptation normally deletes its transformations, attempts, model
invocations, offers, generated documents and artifacts. If one of those generated
documents has since become an input to another transformation, PostgreSQL refuses
the deletion so that provenance is not silently lost. Shared jobs, Oak resource
documents and prompt templates are not deleted.

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
