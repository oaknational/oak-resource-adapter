import { describe, expect, it } from "vitest";

import type {
  JsonValue,
  NamespacedExtensions,
  ResourceDocument,
} from "./schema/types.js";
import {
  CONTRIBUTION_EXTENSION_KEY,
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

  it("does not mutate the document", () => {
    const before = structuredClone(document);

    contributionIdsInDocument(document);

    expect(document).toEqual(before);
  });
});
