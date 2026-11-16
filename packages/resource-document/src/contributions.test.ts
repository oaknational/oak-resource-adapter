import { describe, expect, it } from "vitest";

import type {
  JsonValue,
  NamespacedExtensions,
  ResourceDocument,
} from "./schema/types.js";
import {
  CONTRIBUTION_EXTENSION_KEY,
  contributedNodes,
  contributionIdOf,
  contributionIdsInDocument,
} from "./contributions.js";

const contribution = (id: JsonValue): NamespacedExtensions => ({
  [CONTRIBUTION_EXTENSION_KEY]: id,
});

const document: ResourceDocument = {
  answers: [
    {
      content: [
        {
          content: [{ text: "Answer", type: "text" }],
          extensions: contribution("answer-content"),
          id: "answer-text",
          type: "paragraph",
        },
      ],
      extensions: contribution("answer"),
      id: "answer",
      placement: "append",
      targetId: "question",
    },
  ],
  assets: [
    {
      alternative: { kind: "decorative" },
      contentRef: "support.png",
      extensions: contribution("asset"),
      id: "asset",
      mediaType: "image/png",
    },
  ],
  content: [
    {
      children: [
        {
          children: [
            {
              content: [{ text: "Support", type: "text" }],
              extensions: contribution("nested"),
              id: "support",
              type: "paragraph",
            },
          ],
          extensions: contribution("repeated"),
          id: "question",
          type: "question",
        },
      ],
      extensions: contribution("repeated"),
      id: "section",
      type: "section",
    },
  ],
  diagnostics: [],
  id: "contributions-test",
  language: "en-GB",
  metadata: { title: "Contributions" },
  profile: "worksheet.v0",
  provenance: {
    producer: { name: "test", version: "1" },
    source: { id: "contributions-test", system: "test" },
  },
  schemaVersion: "0.1",
};

describe("resource document contributions", () => {
  it("reads only string contribution identifiers", () => {
    expect(contributionIdOf(contribution("contribution-id"))).toBe("contribution-id");
    expect(contributionIdOf(contribution(42))).toBeUndefined();
    expect(contributionIdOf({})).toBeUndefined();
    expect(contributionIdOf(undefined)).toBeUndefined();
  });

  it("finds unique identifiers throughout the document in stable reading order", () => {
    expect(contributionIdsInDocument(document)).toEqual([
      "repeated",
      "nested",
      "answer-content",
      "answer",
      "asset",
    ]);
  });

  it("returns the outermost nodes of one contribution, in content then answers", () => {
    expect(contributedNodes(document, "repeated").map(({ id }) => id)).toEqual([
      "section",
    ]);
    expect(contributedNodes(document, "nested").map(({ id }) => id)).toEqual([
      "support",
    ]);
    expect(contributedNodes(document, "answer-content").map(({ id }) => id)).toEqual([
      "answer-text",
    ]);
    expect(contributedNodes(document, "missing")).toEqual([]);
  });

  it("does not mutate the document", () => {
    const before = structuredClone(document);

    contributionIdsInDocument(document);
    contributedNodes(document, "repeated");

    expect(document).toEqual(before);
  });
});
