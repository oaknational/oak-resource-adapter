import { describe, expect, it } from "vitest";

import type { ResourceDocument } from "@oaknational/resource-document";

import {
  dismissedTargetIds,
  dismissTransformationsAt,
  documentDismissesTransformations,
  TRANSFORMATIONS_DISMISSED_EXTENSION_KEY,
} from "./dismissal";

const document: ResourceDocument = {
  answers: [],
  assets: [],
  content: [
    {
      children: [
        {
          content: [{ text: "What is erosion?", type: "text" }],
          id: "question-text",
          type: "paragraph",
        },
      ],
      id: "question-1",
      label: "1",
      type: "question",
    },
  ],
  diagnostics: [],
  id: "dismissal-test",
  language: "en-GB",
  metadata: { title: "Dismissal test" },
  profile: "worksheet.v0",
  provenance: {
    producer: { name: "test", version: "1" },
    source: { id: "dismissal-test", system: "test" },
  },
  schemaVersion: "0.1",
};

describe("transformation dismissal", () => {
  it("marks one nested target without mutating the source document", () => {
    const dismissed = dismissTransformationsAt(document, "question-1");

    expect(dismissedTargetIds(dismissed)).toEqual(new Set(["question-1"]));
    expect(dismissedTargetIds(document)).toEqual(new Set());
    expect(dismissed).not.toBe(document);
    expect(dismissed.content[0]?.extensions).toEqual({
      [TRANSFORMATIONS_DISMISSED_EXTENSION_KEY]: true,
    });
  });

  it("marks a target nested inside a question", () => {
    const dismissed = dismissTransformationsAt(document, "question-text");

    expect(dismissedTargetIds(dismissed)).toEqual(new Set(["question-text"]));
  });

  it("uses a separate document-level marker", () => {
    const dismissed = dismissTransformationsAt(document, null);

    expect(documentDismissesTransformations(dismissed)).toBe(true);
    expect(dismissedTargetIds(dismissed)).toEqual(new Set());
  });

  it("leaves the document marker clear when only a target is dismissed", () => {
    const dismissed = dismissTransformationsAt(document, "question-1");

    expect(documentDismissesTransformations(dismissed)).toBe(false);
  });

  it("keeps existing extensions on a dismissed target", () => {
    const once = dismissTransformationsAt(
      {
        ...document,
        content: [
          { ...document.content[0]!, extensions: { "oak:contribution": "c1" } },
        ],
      },
      "question-1",
    );

    expect(once.content[0]?.extensions).toEqual({
      "oak:contribution": "c1",
      [TRANSFORMATIONS_DISMISSED_EXTENSION_KEY]: true,
    });
  });

  it("refuses to create a marker for a missing target", () => {
    expect(() => dismissTransformationsAt(document, "missing")).toThrow(
      'Block "missing" is not in the document.',
    );
  });
});
