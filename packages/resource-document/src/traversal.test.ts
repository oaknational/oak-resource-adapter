import { describe, expect, it } from "vitest";

import { parseResourceMarkup } from "./markup/index.js";
import {
  filterResourceNodes,
  getResourceNodeById,
  getResourceNodesByType,
  updateResourceNodeById,
  walkResourceDocument,
} from "./traversal.js";

const answerMarkup = `---
markup-version: "0.1"
schema-version: "0.1"
profile: "worksheet.v0"
document-id: "traversal-answers"
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

:::oak-answer {id="answer" target="question" placement="append"}
:::oak-paragraph {id="answer-text"}
An answer
:::
:::
`;

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

  it("replaces a nested node and leaves the source document alone", () => {
    const document = parseResourceMarkup(markup);

    const updated = updateResourceNodeById(document, "prompt", (node) => ({
      ...node,
      extensions: { "oak:test": true },
    }));

    expect(updated).toBeDefined();
    expect(getResourceNodeById(updated ?? document, "prompt")?.extensions).toEqual({
      "oak:test": true,
    });
    expect(getResourceNodeById(document, "prompt")?.extensions).toBeUndefined();
  });

  it("replaces a node that only appears in answer content", () => {
    const document = parseResourceMarkup(answerMarkup);

    const updated = updateResourceNodeById(document, "answer-text", (node) => ({
      ...node,
      extensions: { "oak:test": true },
    }));

    expect(updated?.answers[0]?.content[0]?.extensions).toEqual({ "oak:test": true });
  });

  it("reports a missing node rather than returning an unchanged document", () => {
    const document = parseResourceMarkup(markup);

    expect(updateResourceNodeById(document, "absent", (node) => node)).toBeUndefined();
  });

  it("drops rejected nodes throughout content and answer content", () => {
    const document = parseResourceMarkup(answerMarkup);

    const filtered = filterResourceNodes(document, (node) => node.type !== "paragraph");

    expect(getResourceNodeById(filtered, "prompt")).toBeUndefined();
    expect(filtered.answers[0]?.content).toEqual([]);
    expect(getResourceNodeById(filtered, "question")).toBeDefined();
  });

  it("drops a rejected container along with everything inside it", () => {
    const document = parseResourceMarkup(markup);

    const filtered = filterResourceNodes(document, ({ id }) => id !== "question");

    expect(filtered.content).toEqual([]);
  });
});
