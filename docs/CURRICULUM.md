# Curriculum

Oak curriculum access for Resource Adapter, provided by
`@oaknational/resource-adapter-curriculum`. The package provides a repository
that fetches and validates lesson data from Oak's curriculum GraphQL endpoint.

## Repository contract

Create a repository with the endpoint and Resource Adapter API key, then fetch a
lesson by lesson slug and programme slug:

```ts
import {
  createOakLessonRepository,
  CurriculumError,
} from "@oaknational/resource-adapter-curriculum";

const lessons = createOakLessonRepository({
  apiKey: process.env.CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY,
  endpoint: process.env.CURRICULUM_API_URL,
});

try {
  const lesson = await lessons.fetch(lessonSlug, programmeSlug);
} catch (error) {
  if (error instanceof CurriculumError && error.code === "not-found") {
    // No lesson exists for this identity.
  }
  throw error;
}
```

`fetch` returns validated lesson placement, content, resources, content guidance
and maximum restriction levels. It rejects with `CurriculumError`; `code` is one
of:

- `unusable-identity`
- `not-found`
- `upstream-unavailable`
- `timed-out`
- `malformed-response`

Requests time out after 5 seconds by default. Pass `timeoutMs` when creating the
repository to set a different positive integer timeout.

## Local setup

Unit tests do not call the curriculum endpoint. To run the integration test,
set these values in the repository root `.env`:

```sh
CURRICULUM_API_URL=
CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY=
RUN_CURRICULUM_INTEGRATION_TESTS=true
```

Run the integration test from the repository root:

```sh
pnpm --filter @oaknational/resource-adapter-curriculum test:integration
```
