import { describe, expect, it } from "vitest";

import type { DefinitionListNode } from "@oaknational/resource-document";

import { resourceNodeLabel } from "./resource-node-label";

function definitionList(
  entry: DefinitionListNode["entries"][number],
): DefinitionListNode {
  return {
    entries: [entry],
    id: "word-bank",
    lead: [{ text: "Vocabulary you could include:", type: "text" }],
    type: "definitionList",
  };
}

describe("resourceNodeLabel", () => {
  it("gives a question its readable content as context", () => {
    expect(
      resourceNodeLabel({
        id: "question-1",
        type: "question",
        label: "1",
        children: [
          {
            id: "question-text",
            type: "paragraph",
            content: [{ type: "text", text: "Explain the character's choice." }],
          },
        ],
      }),
    ).toBe("Question 1: Explain the character's choice.");
  });

  it.each([
    ["table", "table"],
    ["experimental-results", "experimental-results table"],
  ])("names a %s role without repeating the word", (role, expected) => {
    expect(
      resourceNodeLabel({
        id: "results",
        type: "table",
        role,
        rows: [[{ kind: "answer" }]],
      }),
    ).toBe(expected);
  });

  it("shows a words-only entry", () => {
    expect(
      resourceNodeLabel(
        definitionList({ term: [{ text: "perspective", type: "text" }] }),
      ),
    ).toBe("Vocabulary you could include:\nperspective");
  });

  it("shows definitions and examples when the transformation supplies them", () => {
    expect(
      resourceNodeLabel(
        definitionList({
          definition: [{ text: "a particular point of view", type: "text" }],
          example: [
            {
              text: "The narrators describe the event from different perspectives.",
              type: "text",
            },
          ],
          term: [{ text: "perspective", type: "text" }],
        }),
      ),
    ).toBe(
      "Vocabulary you could include:\nperspective — a particular point of view Example: The narrators describe the event from different perspectives.",
    );
  });
});
