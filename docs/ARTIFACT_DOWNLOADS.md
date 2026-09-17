# Resource artifact downloads

A **resource artifact** is a stored downloadable representation of a resource
document, such as a DOCX or PDF. A **package artifact** is a packed npm package
verified by `pnpm test:package-artifact`. The harness calls its test resources
**download fixtures**; their bytes live in bucket **storage objects**.

`GET /resource-artifacts/:id` authenticates the teacher and serves only generated
artifacts owned by that teacher's adaptation. Missing, foreign, original Oak and
missing-object artifacts all return the same 404. Authentication failures return 401. Ownership survives head changes and abandonment; export preparation will
apply its own eligibility policy. Delivery uses the row's format and MIME type,
so it is not limited to DOCX.

The API sets private/no-store caching, Content-Disposition (attachment filename)
and a Content-Length taken from the object's own storage metadata. The read is
pinned to the generation that metadata describes, so the length always describes
the bytes being sent. Only the document's title is read from the database, so a
later document schema change cannot break downloads of documents already
written. The harness proxy must not forward Content-Length or Content-Encoding:
its fetch body has already been decompressed.

## Local setup and database rebuilds

Pull the shared local development configuration from Doppler into `.env`, start
PostgreSQL, then run:

```sh
pnpm db:migrate:dev
pnpm db:seed:dev
```

`pnpm db:seed:dev` seeds only a local development database.
Developers with an existing migrated database can refresh
their `.env` from Doppler and run this command directly, with the credentials
listed below.

For a clean local development database, run:

```sh
pnpm db:reset:seed:dev
```

This deletes local database data, reapplies migrations and then seeds the fixture.
It checks the local target and fixture access before resetting. After a standalone
`pnpm db:reset` (which already applies migrations), run `pnpm db:seed:dev` again.
The seed command builds its workspace dependencies and restores the artifact row
and ownership chain using `RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID` from Doppler.
It reads the existing `local/_persistent-fixtures/do-not-delete/artifact-download/v1/worksheet.docx`
object; it never uploads, replaces or deletes it. Every developer's database uses
the same artifact ID and shared object, so rebuilding needs no configuration change.

Seeding requires the configured bucket, GCP application-default credentials
(`gcloud auth application-default login`), `CLERK_SECRET_KEY` and
`E2E_CLERK_USER_EMAIL`. It looks up that existing test teacher without creating an
account. Repeated runs preserve existing records; a conflicting ID, owner or file
is an error rather than an overwrite. Deployed databases and the staging proxy
are refused. Restart the harness after initially loading its configuration.

## Manual testing with your own account

On local development, preview or staging, enable `ENABLE_DEV_ROUTES` on the API
and configure its database and bucket credentials. In **Exports → Stored downloads**,
the **Your download fixture** panel lets you create, download,
delete and refresh the status of an artifact owned by your signed-in account.
Downloads use the same authenticated artifact route as the shared one. The panel
shows the environment reported by the API, and reports when the API has dev
routes disabled. Create uploads the DOCX and inserts its database records and
ownership chain.

Your own artifact uses a fixed key:

```
<environment>/_developer-fixtures/<Clerk user ID>/artifact-download/worksheet.docx
```

Clerk IDs keep the prefix stable without including names or email addresses.
The status checks both the database record and the stored object. Create repairs
missing local records after a database reset, or recreates a missing object.
Delete removes that account's object and fixture records; repeated deletion is
safe. Refresh status after an error to check whether an operation completed.
These are separate from `_persistent-fixtures/do-not-delete` and do not change
the shared artifact ID or its owner.

The API derives the prefix from its server configuration: local development uses
`local`; Vercel preview uses `preview`; the staging custom environment uses
`staging` via `VERCEL_TARGET_ENV`. Preview and staging remain separate even in
their shared database and bucket. Each account can keep one artifact per
environment until it is deleted. No separate provisioning or ID variable is
needed.
All preview branches share the `preview` prefix: an account's fixture created on
one preview is available on the others, and deletion removes it for all previews.
Staging remains separate. Fixture-management operations lock on the full storage
key in the shared database to serialise concurrent requests.

Production and unknown deployment environments are refused. Local development
still requires a local database and refuses the staging proxy.
The server derives the key from the authenticated account; callers cannot choose
another account or an arbitrary storage key.

## One-time shared fixture provisioning

Reserve this prefix in each environment and exclude it from transient/manual cleanup:

```
<environment>/_persistent-fixtures/do-not-delete/artifact-download/v1/worksheet.docx
```

Its database chain uses capability/job/transformation names identifying it as an
artifact-download fixture. The adaptation is abandoned, has no lesson or head,
and is never offered by the scaffolding resume flow. Preserve these records too.
The DOCX contains synthetic text and four generated PNGs (roughly 0.8 MiB), needs
no model calls or external image downloads, and belongs to the Clerk test teacher.

This is an operator setup step, not the developer seed command. Provision once
using the target database, bucket and credentials. Explicitly set
the database and bucket for the chosen environment; the environment argument only
selects the object-key prefix. Production provisioning is refused.

```sh
pnpm --filter @oaknational/resource-adapter-api... build
node --env-file=.env apps/api/scripts/provision-download-fixture.mjs --environment local --teacher user_THE_TEST_TEACHER_ID
```

For Preview/staging, use that environment's database connection and storage
credentials and pass `--environment preview` or `--environment staging`.
Set the printed `RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID` on the corresponding
harness deployment (and in `.env` for local development), then redeploy/restart it.
Use the Clerk user ID for the account named by `E2E_CLERK_USER_EMAIL` in that environment.
Do not put tokens or storage credentials in this variable; it contains only an artifact UUID.

Rerunning verifies the existing owner and storage metadata and returns the same
artifact ID. It never reassigns a fixture, overwrites an object or deletes anything.
A failed database transaction after upload can leave an unreferenced object; a
rerun then refuses the existing key. Investigate that exact fixture before repair.

In the harness, open **Exports → Stored downloads**, sign in as its owning
test teacher and select **Download stored DOCX**. To try any other artifact by
ID, add `&artifact=<uuid>` to that URL; the route still authorises against the
signed-in account, so an ID you do not own answers 404. The deployment-safe
browser test requires this configuration and fails if it is missing; it never
provisions or cleans up data. Local browser runs skip the real-storage smoke
test unless the fixture is configured. Other browser tests name their own
artifact and mock the download response.
