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
- [`fixtures/linear-equations-smoke/extracted.mmd`](../original-resource-documents/fixtures/linear-equations-smoke/extracted.mmd)
  is the executable markup example.
- [`fixtures/linear-equations-smoke/expected/document.json`](../original-resource-documents/fixtures/linear-equations-smoke/expected/document.json)
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

<!-- vocabulary:start -->

| Directive                | Canonical output  | Child blocks |
| ------------------------ | ----------------- | ------------ |
| `oak-section`            | `section`         | Yes          |
| `oak-heading`            | `heading`         | No           |
| `oak-paragraph`          | `paragraph`       | No           |
| `oak-learning-objective` | `callout`         | No           |
| `oak-instruction`        | `callout`         | No           |
| `oak-callout`            | `callout`         | No           |
| `oak-question`           | `question`        | Yes          |
| `oak-answer-space`       | `responseSpace`   | No           |
| `oak-figure`             | `figure`          | No           |
| `oak-table`              | `table`           | No           |
| `oak-ion-table`          | `table`           | No           |
| `oak-rhythm-grid`        | `table`           | No           |
| `oak-code-block`         | `codeBlock`       | No           |
| `oak-unsupported`        | `unsupported`     | No           |
| `oak-answer`             | Answer annotation | Yes          |

<!-- vocabulary:end -->

`oak-heading` requires `level` from 1 to 6. `oak-question` accepts `number`
and non-negative `marks`. Questions cannot be nested. Callout aliases select
`learning-objective` or `instruction`; `oak-callout` requires a `role` of
`learning-objective`, `instruction`, `note` or `warning`.
`oak-answer-space` requires `kind` (`lines`, `box`, `grid`); `lines` requires
a positive `lines` count. It has no body. `oak-answer` requires `target` and
`placement` (`append`, `replace-response`) and contains answer blocks outside
pupil content. `oak-unsupported` requires `description` and `format`, accepts
`accessible-text`, and preserves its body.

### Tables and code

`oak-table` accepts `role` (default `table`) and `header` (default `true`).
`oak-ion-table` and `oak-rhythm-grid` use the same grammar, with default roles
`ions` and `rhythm`. Roles describe content; they do not create new node types.
Rows are lines of pipe-separated cells, without Markdown separator rows. A pair
of outer pipes is optional; blank lines are ignored. With `header="true"`, the
first row supplies column headings. Every row must have the same number of cells.
Headers and body rows share one cell grammar: inline text and maths, `?` for a
pupil answer blank, or `~` for an ordinary empty cell. Every cell must contain
text or an explicit marker. Literal pipes and reserved single-cell markers are
not supported as cell text in 0.1.

`oak-code-block` accepts optional `language`. Its body becomes `source`, with
spaces, tabs and blank lines preserved and line endings normalised to `\n`. The
framing newline before the closing `:::` is excluded. Code is not parsed as inline or child markup.
A standalone `:::` is reserved as the closing delimiter.

The exported `resourceVocabulary` in `@oaknational/resource-document` is the
node/directive agreement with extraction; its `annotations` entry describes the
answer directive. Nodes such as `definitionList` can exist without a markup
directive. The table above is generated with `pnpm vocabulary:generate`; a test
rejects stale output.

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
