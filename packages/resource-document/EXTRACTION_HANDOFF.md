# Extraction markup handoff

> WIP: This is a placeholder - it will be updated once we've created the first iteration
> based on upcoming sample data.

This is the starting point for the extraction team. For the `0.1` spike, the
extractor emits one self-contained semantic-markup string.

```text
extraction team                         @oaknational/resource-document
markup string  ──────────────────────>  parseResourceMarkup  ──────────>  canonical JSON 0.1
```

The extraction team's obligation ends at the markup string. This package owns
conversion into canonical JSON, defaults, Zod validation and cross-document
validation. The consuming application owns loading the string from a database,
object store or file, plus persistence, caching and later transformations.

The grammar is deliberately provisional while real extraction samples are
gathered. Changes should be agreed here if possible.

## Authoritative handoff material

- This document defines the currently accepted fields and grammar.
- [`fixtures/linear-equations-smoke/extracted.mmd`](fixtures/linear-equations-smoke/extracted.mmd)
  is the executable markup example.
- [`fixtures/linear-equations-smoke/expected/document.json`](fixtures/linear-equations-smoke/expected/document.json)
  shows the canonical JSON generated from that example.

The acceptance criterion is:

```ts
safeParseResourceMarkup(markup).success === true;
```

Import that function from `@oaknational/resource-document/markup`. A failure
returns a `ResourceDocumentParseError`. Syntax and directive-validation failures
include the 1-based submitted line in `context.line`. Canonical schema and
cross-reference failures currently expose structured issue paths and may not yet
carry a source line; add source-to-canonical location mapping when real samples
show which diagnostics the extraction loop needs most.

## Required frontmatter

Markup starts with a frontmatter block. Every value is a quoted JSON string,
including values that represent numbers.

```yaml
---
markup-version: "0.1"
schema-version: "0.1"
profile: "worksheet.v0"
document-id: "oak:worksheet:example"
language: "en-GB"
title: "Example worksheet"
source-system: "oak"
source-id: "source-resource-id"
producer: "extractor-service-name"
producer-version: "extractor-service-version"
---
```

The required fields are:

| Field              | Requirement                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `markup-version`   | Exactly `"0.1"`. Selects the extraction markup grammar.               |
| `schema-version`   | Exactly `"0.1"`. Selects the generated canonical JSON contract.       |
| `profile`          | `"worksheet.v0"` or `"generic.v0"`.                                   |
| `document-id`      | Non-empty stable identifier, at most 256 characters.                  |
| `language`         | BCP 47 language tag such as `"en-GB"`.                                |
| `source-system`    | Non-empty name of the source system, generally `"oak"`.               |
| `source-id`        | Non-empty identifier in the source system.                            |
| `producer`         | Non-empty extractor or producer name.                                 |
| `producer-version` | Non-empty version identifying the producing implementation.           |
| `title`            | Required and non-empty for `worksheet.v0`; optional for `generic.v0`. |

Supported optional frontmatter fields are:

- `subject-id` and `subject-label`;
- `key-stage-id` and `key-stage-label`;
- `year-group-id` and `year-group-label`;
- `target-reading-age` as a positive integer encoded in a quoted string;
- `source-uri`; and
- `source-checksum-sha256` as 64 hexadecimal characters.

A context label requires its corresponding ID. Duplicate or unknown
frontmatter fields are rejected rather than silently discarded.

## Markup body

Plain Markdown headings (`#` through `######`) become heading nodes. Other
non-empty blocks become paragraphs. Inline `\(...\)` and display `\[...\]`
content become math runs; the math value is preserved rather than evaluated.
A bare `$` is ordinary text, so prices need no escaping.

Plain headings and paragraphs receive IDs generated under the reserved
`unstable:` prefix. Those IDs are derived from position and content, so
surrounding edits change them and nothing should store them as a reference. Use
the explicit `oak-heading` and `oak-paragraph` directives whenever an ID must be
stable or referenced by another directive.

### Directive syntax

Directives use this shape and must be closed:

```mmd
:::oak-question {id="question-1" number="1" marks="2"}
Question content
:::
```

Attribute values are quoted JSON strings. All supported content directives
require an explicit `id`.

Lines beginning with the reserved `:::` marker must be either a valid `oak-*`
directive opening or a matching closing marker. Malformed openings and stray
closings fail parsing instead of becoming ordinary paragraph text. This grammar
is provisional and will be revised against real extraction samples.

| Directive                | Additional attributes and content                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `oak-section`            | Contains child blocks.                                                                                                                         |
| `oak-heading`            | Requires `level="1"` through `level="6"`; contains inline content.                                                                             |
| `oak-paragraph`          | Contains inline content.                                                                                                                       |
| `oak-learning-objective` | Contains inline content.                                                                                                                       |
| `oak-instruction`        | Contains inline content.                                                                                                                       |
| `oak-callout`            | Requires `role`: `learning-objective`, `instruction`, `note` or `warning`; contains inline content.                                            |
| `oak-question`           | Optional `number` and non-negative integer `marks`; contains child blocks. Questions cannot be nested.                                         |
| `oak-answer-space`       | Requires `kind`: `lines`, `box` or `grid`. `lines` also requires a positive integer `lines`; other kinds omit it. Cannot contain content.      |
| `oak-answer`             | Requires `target` and `placement` (`append` or `replace-response`); contains one or more answer blocks and is collected outside pupil content. |
| `oak-figure`             | Carries its asset metadata in place as described below; optional body content becomes the caption.                                             |
| `oak-unsupported`        | Requires `description` and `format`; optional `accessible-text`; its body preserves the original value.                                        |

Every content-node directive also accepts these common attributes:

| Attribute                         | Meaning                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `keep-together`, `keep-with-next` | `"true"` or `"false"`.                                                             |
| `break-before`, `break-after`     | `"auto"` or `"page"`.                                                              |
| `preferred-width`                 | `"content"`, `"full"` or `"half"`.                                                 |
| `extensions`                      | A JSON object encoded inside the quoted attribute string; keys must be namespaced. |

`oak-answer` accepts `extensions`, but not layout attributes. Unknown attributes
on a supported directive are rejected.

An unknown `oak-*` directive is preserved as an `unsupported` node with a
review-required diagnostic. This avoids losing source evidence, but does not
make that directive part of the supported contract.

## Images and other assets

An asset is declared where it appears, currently with an `oak-figure`
directive. The parser creates the canonical figure node and the corresponding
entry in the document's `assets` array.

```mmd
:::oak-figure {id="diagram-1" asset-id="diagram-1-image" media-type="image/png" src="https://example.test/assets/diagram-1.png" alt-kind="text" alt="A labelled triangle." alt-origin="source" width="1200" height="800" rights="Copyright Oak National Academy." credit="Oak National Academy"}
Figure 1: A labelled triangle.
:::
```

Required asset attributes are:

- `asset-id`: a stable ID for the asset, distinct from the figure node's `id`;
- `media-type`: the MIME type, for example `image/png` or `image/svg+xml`;
- `src`: an opaque, non-empty content reference. For the spike this can be a
  stable external URL. This package records it but never fetches or resolves it;
  and
- `alt-kind`: `text`, `decorative` or `missing`.

For `alt-kind="text"`, both `alt` and `alt-origin` are required. `alt-origin` is
`source`, `inferred` or `authored`. The `decorative` and `missing` kinds must not
include either attribute. `missing` is explicit evidence that alternative text
still needs attention; it is not equivalent to decorative content.

Optional asset attributes are:

- `width` and `height`, which are positive numbers and must appear together;
- `rights` and `credit`; and
- `asset-extensions`, a namespaced JSON object encoded as a quoted string.

If the same `asset-id` appears more than once, its metadata must be identical.
The parser deduplicates it into one canonical asset entry. Storage location,
signed-URL renewal, downloading and content availability are application or
platform concerns, not contract-package responsibilities.

## Generated canonical fields

The canonical JSON model contains `assets`, `sourceMap`, `diagnostics` and
document-level `extensions`, but they are not separate extraction sidecars in
the current markup API:

- `assets` is generated from in-place asset directives;
- parser diagnostics are generated when markup must be preserved without full
  interpretation;
- `sourceMap` and document-level `extensions` are reserved for an
  evidence-backed inline representation once real samples require them.

References are validated across the generated document. IDs must be unique;
answers must target pupil-facing nodes; and figures must resolve to generated
asset entries. Profile rules beyond metadata are deliberately not enforced
while the grammar is provisional.

## Version status

Markup `0.1`, schema `0.1` and both `.v0` profiles remain experimental during the
initial spike and may change incompatibly before production. They are separate
versions because extraction syntax and canonical JSON can evolve independently.
Once either contract needs compatibility, incompatible changes receive a new
version rather than silently changing a frozen one.
