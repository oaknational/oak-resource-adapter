# Curriculum

`@oaknational/resource-adapter-curriculum` reads Oak's published curriculum: a
repository that resolves a lesson to this service's internal `Lesson`, and a store
that returns the bytes of a resource. Both are server-only — endpoints, keys and
signed URLs never reach a browser.

```ts
import {
  createOakLessonRepository,
  createOakResourceStore,
  findLessonResource,
  oakCurriculumConfigFromEnv,
  oakResourceStoreConfigFromEnv,
} from "@oaknational/resource-adapter-curriculum";

const lessons = createOakLessonRepository(oakCurriculumConfigFromEnv(process.env));
const resources = createOakResourceStore(oakResourceStoreConfigFromEnv(process.env));

const lesson = await lessons.fetch({ lessonSlug, programmeSlug });

if (findLessonResource(lesson, "worksheet") !== undefined) {
  const { bytes, contentType } = await resources.fetch(lesson, "worksheet");
}
```

Both slugs are required: a lesson appears in as many programmes as it is taught
in, and its programme decides its unit and its tier, so a slug alone has no single
answer. Where Oak publishes rows that disagree once mapped, the repository raises
`ambiguous-identity` rather than picking one.

## Reading a resource

Reads go through [Oak's downloads
API](https://github.com/oaknational/curriculum-downloads-api), which holds the
service account for the private buckets and answers with a signed URL, so the
Resource Adapter needs no storage credential of its own. Two things follow:

- It answers with a **zip**, so the store takes the file it asked for out by name.
  [`download-selection.ts`](../packages/curriculum/src/resource/download-selection.ts)
  maps each of our resource types to the `selection` to ask for and the filename to
  expect, because that API names resources by format and calls the starter quiz the
  intro quiz.
- **A gated lesson cannot be read.** Its authorisation wants a signed-in teacher's
  Clerk token and its issuer allowlist admits only OWA, so this service has no
  identity it accepts. Every gated lesson carries third-party material at `Highly
restricted`, so filtering `maxRestrictions` on that level excludes them before a
  download is attempted.

The semantic content extracted from a resource is a separate concern, in
`@oaknational/resource-document`.

## Errors

Everything resolves or rejects with a `CurriculumError`; each `code` is described
on [`CurriculumErrorCode`](../packages/curriculum/src/errors.ts). `not-found` and
`unavailable-resource` are ordinary answers and are not reported to Sentry;
everything else is. No log or Sentry event carries the API key, a resource location
or file contents.

Curriculum requests time out after 5 seconds and resource reads after 15, the
latter for each of the two hops a read makes.

## In-memory implementations

`createInMemoryLessonRepository` and `createInMemoryResourceStore` satisfy the same
interfaces, for tests and for harness scenarios that must not depend on Oak being
up. The `*.contract.test.ts` files run both implementations through the same
expectations, so the fakes cannot drift.

## The pinned schema

Response shapes come from `@oaknational/oak-curriculum-schema`, pinned to an exact
version in [`package.json`](../packages/curriculum/package.json). Oak also versions
each published view in its name, in
[`lesson-query.ts`](../packages/curriculum/src/lesson/lesson-query.ts). To move to a
newer schema or view, bump the version or edit the view name, then run the
integration test: a new view can drop or rename a column this package reads.

## Local setup

The three `CURRICULUM_*` values in [`.env.example`](../.env.example) are needed in
the gitignored root `.env`. Once the deployments are provisioned, `pnpm
env:pull:dev` writes them: the two URLs belong with the other non-secret values in
`env_vars`, and the API key follows [adding a new
secret](DEVELOPMENT.md#adding-a-new-secret).

Unit tests make no network calls. The integration test reaches Oak for real:

```sh
pnpm test:integration --filter=@oaknational/resource-adapter-curriculum
```

Run it from the root rather than through the package: only the root script loads
`.env`, and turbo forwards just the variables the task declares. Reading a resource
leaves a cached archive in the downloads API's own bucket, named from the lesson,
the selection and the assets' last update, so repeated runs reuse one.
