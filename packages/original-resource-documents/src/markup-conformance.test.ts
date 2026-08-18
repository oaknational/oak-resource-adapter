import {
  getResourceNodesByType,
  parseResourceDocument,
} from "@oaknational/resource-document";
import { parseResourceMarkup } from "@oaknational/resource-document/markup";
import { describe, expect, it } from "vitest";

import {
  loadOriginalResourceDocumentFixture,
  originalResourceDocumentFixtureManifest,
} from "./fixtures.js";

describe("original resource document markup conformance", () => {
  it.each(originalResourceDocumentFixtureManifest)(
    "parses fixture $id into its reviewed document",
    async ({ id }) => {
      const fixture = await loadOriginalResourceDocumentFixture(id);
      const document = parseResourceMarkup(fixture.markup);

      expect(document).toEqual(fixture.expectedDocument);
      expect(parseResourceDocument(document)).toEqual(document);
    },
  );

  it("exposes the synthetic fixture's representative questions and asset", async () => {
    const fixture = await loadOriginalResourceDocumentFixture("linear-equations-smoke");
    const document = parseResourceMarkup(fixture.markup);

    expect(getResourceNodesByType(document, "question")).toHaveLength(2);
    expect(document.assets).toEqual([
      expect.objectContaining({
        id: "balance-model-image",
        contentRef: "https://example.test/assets/balance-model.svg",
      }),
    ]);
  });

  it("parses checksums, answers and node extensions", async () => {
    const fixture = await loadOriginalResourceDocumentFixture("linear-equations-smoke");
    const markup = fixture.markup
      .replace(
        'source-id: "linear-equations-smoke"',
        `source-id: "linear-equations-smoke"\nsource-checksum-sha256: "${"a".repeat(64)}"`,
      )
      .replace(
        "# Exploring linear equations",
        ':::oak-heading {id="title" level="1" extensions="{\\"oak:source-kind\\":\\"title\\"}"}\nExploring linear equations\n:::',
      )
      .concat(
        '\n:::oak-answer {id="answer-1" target="question-1" placement="append" extensions="{\\"oak:answer-kind\\":\\"worked\\"}"}\n:::oak-paragraph {id="answer-1-content"}\n\\(x = 20/3\\)\n:::\n:::\n',
      );

    const enriched = parseResourceMarkup(markup);
    expect(enriched.provenance.source.checksum?.value).toBe("a".repeat(64));
    expect(enriched.content[0]).toMatchObject({
      id: "title",
      extensions: { "oak:source-kind": "title" },
    });
    expect(enriched.answers[0]).toMatchObject({
      targetId: "question-1",
      extensions: { "oak:answer-kind": "worked" },
    });
  });

  it("preserves unknown directives as unsupported content and a diagnostic", async () => {
    const fixture = await loadOriginalResourceDocumentFixture("linear-equations-smoke");
    const markup = `${fixture.markup}\n:::oak-future-widget {id="future-widget"}\nImportant source content\n:::\n`;
    const document = parseResourceMarkup(markup);

    expect(getResourceNodesByType(document, "unsupported")).toEqual([
      expect.objectContaining({
        id: "future-widget",
        original: expect.objectContaining({
          value: expect.stringContaining("Important"),
        }),
      }),
    ]);
    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        category: "unsupported-markup",
        nodeId: "future-widget",
      }),
    ]);
  });
});
