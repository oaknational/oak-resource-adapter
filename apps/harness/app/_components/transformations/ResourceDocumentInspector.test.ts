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
