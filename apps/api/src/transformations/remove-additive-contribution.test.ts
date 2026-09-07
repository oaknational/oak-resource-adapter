import { describe, expect, it } from "vitest";
import {
  CONTRIBUTION_EXTENSION_KEY,
  type ResourceDocument,
} from "@oaknational/resource-document";

import { removeAdditiveContribution } from "./remove-additive-contribution";

function contributed(id: string) {
  return { extensions: { [CONTRIBUTION_EXTENSION_KEY]: id } };
}

function paragraph(id: string, text: string, extensions = {}) {
  return {
    content: [{ text, type: "text" as const }],
    id,
    type: "paragraph" as const,
    ...extensions,
  };
}

const sourceDocument: ResourceDocument = {
  answers: [
    {
      content: [paragraph("kept-answer-text", "Kept answer text")],
      id: "kept-answer",
      placement: "append",
      targetId: "original-question",
    },
    {
      content: [],
      id: "removed-answer",
      placement: "append",
      targetId: "original-question",
      ...contributed("one"),
    },
    {
      content: [paragraph("nested-answer-text", "Nested", contributed("one"))],
      id: "answer-with-contributed-content",
      placement: "append",
      targetId: "original-question",
    },
  ],
  assets: [
    {
      alternative: { kind: "decorative" },
      contentRef: "kept.png",
      id: "kept-asset",
      mediaType: "image/png",
    },
    {
      alternative: { kind: "decorative" },
      contentRef: "removed.png",
      id: "removed-asset",
      mediaType: "image/png",
      ...contributed("one"),
    },
  ],
  content: [
    paragraph("original", "Keep"),
    {
      children: [
        {
          children: [
            paragraph("removed-child", "Remove", contributed("one")),
            paragraph("other-child", "Other contribution", contributed("two")),
          ],
          id: "original-question",
          type: "question",
        },
      ],
      id: "original-section",
      type: "section",
    },
    { ...paragraph("removed-top-level", "Remove"), ...contributed("one") },
  ],
  diagnostics: [],
  id: "removal-test",
  language: "en-GB",
  metadata: { title: "Removal test" },
  profile: "worksheet.v0",
  provenance: {
    producer: { name: "test", version: "1" },
    source: { id: "removal-test", system: "test" },
  },
  schemaVersion: "0.1",
};

function nodeIds(nodes: ResourceDocument["content"]): string[] {
  return nodes.flatMap((node) => [
    node.id,
    ...(node.type === "question" || node.type === "section"
      ? nodeIds(node.children)
      : []),
  ]);
}

describe("removeAdditiveContribution", () => {
  it("drops nested and top-level content attributed to the contribution", () => {
    const result = removeAdditiveContribution(sourceDocument, "one");

    expect(nodeIds(result.content)).toEqual([
      "original",
      "original-section",
      "original-question",
      "other-child",
    ]);
  });

  it("leaves another contribution's content in place", () => {
    const result = removeAdditiveContribution(sourceDocument, "one");

    expect(nodeIds(result.content)).toContain("other-child");
  });

  it("drops attributed answers and attributed content inside kept answers", () => {
    const result = removeAdditiveContribution(sourceDocument, "one");

    expect(result.answers.map(({ id }) => id)).toEqual([
      "kept-answer",
      "answer-with-contributed-content",
    ]);
    expect(result.answers[1]?.content).toEqual([]);
    expect(result.answers[0]?.content).toHaveLength(1);
  });

  it("drops attributed assets and keeps the rest", () => {
    const result = removeAdditiveContribution(sourceDocument, "one");

    expect(result.assets.map(({ id }) => id)).toEqual(["kept-asset"]);
  });

  it("leaves the document untouched when nothing carries the contribution", () => {
    const result = removeAdditiveContribution(sourceDocument, "absent");

    expect(nodeIds(result.content)).toEqual(nodeIds(sourceDocument.content));
    expect(result.answers).toHaveLength(sourceDocument.answers.length);
    expect(result.assets).toHaveLength(sourceDocument.assets.length);
  });

  it("returns a new document rather than mutating the source", () => {
    removeAdditiveContribution(sourceDocument, "one");

    expect(nodeIds(sourceDocument.content)).toContain("removed-top-level");
    expect(sourceDocument.answers).toHaveLength(3);
  });
});
