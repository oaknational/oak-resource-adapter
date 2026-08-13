import { describe, expect, it } from "vitest";

import { parseResourceMarkup } from "./markup/index.js";
import {
  getResourceNodeById,
  getResourceNodesByType,
  walkResourceDocument,
} from "./traversal.js";

const markup = `---
markup-version: "0.1"
schema-version: "0.1"
profile: "worksheet.v0"
document-id: "traversal-test"
language: "en-GB"
title: "Traversal"
source-system: "test"
source-id: "traversal"
producer: "test"
producer-version: "1"
---

:::oak-question {id="question"}
:::oak-paragraph {id="prompt"}
A prompt
:::
:::
`;

describe("resource document traversal", () => {
  it("walks nested nodes in semantic order and narrows by node type", () => {
    const document = parseResourceMarkup(markup);
    expect(Array.from(walkResourceDocument(document), (node) => node.id)).toEqual([
      "question",
      "prompt",
    ]);
    expect(getResourceNodeById(document, "prompt")).toMatchObject({
      type: "paragraph",
    });
    expect(getResourceNodesByType(document, "question")).toEqual([
      expect.objectContaining({ id: "question" }),
    ]);
  });
});
