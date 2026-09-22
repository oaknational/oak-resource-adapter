# Resource artifact downloads

A **resource artifact** is a stored downloadable representation of a resource
document, such as a DOCX or PDF.

> Distinct from the **package artifact** checked by `pnpm test:package-artifact`,
> which is a packed npm package.

`GET /resource-artifacts/:id` serves an artifact only to the teacher whose
adaptation generated it. Missing, foreign, original Oak and missing-object
artifacts all answer the same 404, so a refusal cannot confirm that an artifact
exists. The rule is stated next to its query in
[`repository.ts`](../apps/api/src/resource-artifacts/repository.ts).

The harness proxy must not forward Content-Length or Content-Encoding: undici
has already decompressed its fetch body, so the upstream length describes the
compressed bytes and would truncate the download.

## Adapted worksheets

The scaffolding workflow prepares a DOCX through the internal API using the
adaptation ID and displayed database document ID. Ownership, the current head,
completed acceptance and pending document-changing operations are checked in one database
snapshot. Rendering and storage run after that read; they do not modify the
adaptation. A stale request must refresh the worksheet before preparing again.

The browser downloads the returned artifact through the authenticated route above.
A delivery retry reuses the artifact; a preparation retry renders again. Closing
or changing the worksheet cancels browser requests and discards late results.

Each successful preparation creates a new artifact row and bucket object, including
preparation after a reload. There is no persistent export cache or automatic
artifact cleanup. Reuse needs an invalidation policy covering renderer changes
and remote assets; immutable document JSON alone is not a sufficient cache key.
Retention, orphan cleanup and the follow-up decisions on reuse are tracked in
[ADAPT-94](https://linear.app/oaknational/issue/ADAPT-94/decide-and-record-oras-data-lifecycle-retention-deletion-and-erasure).

The deterministic browser journey uses real rendering, persistence and delivery
against [fake-gcs-server](https://github.com/fsouza/fake-gcs-server) 1.56.1. CI starts
it on port 4443 and creates `resource-adapter-e2e`. To use an equivalent local
emulator, set `RESOURCE_ARTIFACTS_EMULATOR_ORIGIN=http://127.0.0.1:4443` and
`RESOURCE_ARTIFACTS_BUCKET=resource-adapter-e2e` on both the API and browser test
processes.

## The shared download fixture

One artifact per environment, owned by the Clerk test teacher. Exclude this
prefix and its database records from any cleanup:

```
<environment>/_persistent-fixtures/do-not-delete/artifact-download/v1/worksheet.docx
```

`pnpm db:seed:dev` ([database](DATABASE.md#commands)) restores the local database
records against the existing object and never writes to the bucket. It needs GCP
application-default credentials (`gcloud auth application-default login`), plus
`RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID`, `CLERK_SECRET_KEY` and
`E2E_CLERK_USER_EMAIL` to resolve the owning teacher. A conflicting ID, owner or
file is an error rather than an overwrite.

To use it, open **Exports → Stored downloads**, sign in as that test teacher and
select **Download stored DOCX**. Adding `&artifact=<uuid>` to the URL targets any
artifact by ID; the route still authorises against the signed-in account.

## Testing with your own account

Enable `ENABLE_DEV_ROUTES` on a local, preview or staging API. The **Your
download fixture** panel then creates, downloads and deletes an artifact owned by
your signed-in account, at:

```
<environment>/_developer-fixtures/<Clerk user ID>/artifact-download/worksheet.docx
```

The Clerk ID keeps that key stable without putting a name or an email address in
the bucket, and the server derives it from the authenticated account, so a caller
cannot reach another account or an arbitrary key. All preview branches share the
`preview` prefix, so an artifact created on one is available on the others and
deleting it removes it everywhere; staging stays separate.

## Provisioning the shared fixture

An operator step, run once per environment, not the developer seed command. Set
the database and bucket for the target environment explicitly — `--environment`
only selects the object-key prefix. Production is refused.

```sh
pnpm --filter @oaknational/resource-adapter-api... build
node --env-file=.env apps/api/scripts/provision-download-fixture.mjs --environment local --teacher user_THE_TEST_TEACHER_ID
```

Pass the Clerk user ID for the account named by `E2E_CLERK_USER_EMAIL` in that
environment. Set the printed `RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID` on the
corresponding harness deployment, then redeploy or restart it — the harness reads
it at boot. That variable holds only an artifact UUID; never a token or
credential.

Rerunning returns the same artifact ID and never reassigns or overwrites. A
database transaction that fails after the upload leaves an unreferenced object,
and a rerun then refuses the existing key — investigate that fixture before
repairing it.
