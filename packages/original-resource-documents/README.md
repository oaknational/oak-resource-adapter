# @oaknational/resource-adapter-original-resource-documents

ORA's private, server-only boundary for retrieving validated `ResourceDocument`
instances for Oak's original, unadapted lesson resources. `curriculum` supplies
the original files; this package supplies the structured documents derived from
them.

```ts
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";

const lesson = {
  source: "oak",
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
} as const;

await originalResourceDocuments.listExtractedResourceTypes(lesson); // ["worksheet"]
await originalResourceDocuments.get({ ...lesson, resourceType: "worksheet" });
```

Providers deal in extraction markup, because that is what the extraction service
hands over; the reader parses it with `parseResourceMarkup`, which validates
against the current schema on the way out. `getMarkup` returns the same payload
unparsed. An extraction-service adapter implements
`OriginalResourceDocumentProvider` and is composed once with
`createOriginalResourceDocumentReader`, and nothing above the provider changes.

Each fixture is an `extracted.mmd` alongside the `expected/document.json` it
must parse into. Only the markup is served; the JSON is a conformance assertion,
regenerated with `pnpm fixtures:generate` and reviewed as a contract change.

The corpus is a snapshot. Each Oak fixture records the date it last passed
`scripts/verify-original-resource-document-fixture-rights.mjs`, which checks
against live curriculum data that Oak publishes the worksheet and records no
third-party material restrictions. Re-run it when adding a fixture.

Kept separate from `@oaknational/resource-document` so that package stays a
portable schema and parsing library, with no fixture data or server-side I/O in
its npm artifact.
