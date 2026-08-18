import { describe, expect, it } from "vitest";

import { edgeCaseNavigation, loadEdgeCase } from "./edge-cases";

function factValue(facts: readonly { term: string; value: string }[], term: string) {
  return facts.find((fact) => fact.term === term)?.value;
}

describe("edge cases", () => {
  it("fails only the extraction half when Oak publishes a worksheet", async () => {
    const edgeCase = await loadEdgeCase("worksheet-without-extraction");

    expect(edgeCase.lesson.availableResources).toEqual(["worksheet"]);
    expect(factValue(edgeCase.facts, "Worksheet data we hold")).toBe("None");
  });

  it("fails only the published half when the corpus holds an extraction", async () => {
    const edgeCase = await loadEdgeCase("extraction-without-worksheet");

    expect(edgeCase.lesson.availableResources).toEqual(["starter-quiz"]);
    expect(factValue(edgeCase.facts, "Worksheet data we hold")).toBe("worksheet");
  });

  it("preserves an unknown directive instead of dropping it", async () => {
    const edgeCase = await loadEdgeCase("unsupported-markup");

    expect(edgeCase.diagnostics).toEqual([
      {
        category: "unsupported-markup",
        severity: expect.any(String),
        message: expect.any(String),
        nodeId: "future-widget",
      },
    ]);
    expect(edgeCase.unsupportedNodeIds).toEqual(["future-widget"]);
    expect(factValue(edgeCase.facts, "Questions we could still read")).toBe("1");
  });

  it("reports no extraction notes for the eligibility cases", async () => {
    const edgeCase = await loadEdgeCase("worksheet-without-extraction");

    expect(edgeCase.diagnostics).toEqual([]);
    expect(edgeCase.unsupportedNodeIds).toEqual([]);
  });

  it("classifies unparseable markup rather than letting it escape", async () => {
    const edgeCase = await loadEdgeCase("malformed-extraction");

    expect(factValue(edgeCase.facts, "Error type")).toBe("malformed-document");
    expect(factValue(edgeCase.facts, "Underlying reason")).not.toBe("none");
  });

  it("sends the unreachable case somewhere that does not route", async () => {
    const edgeCase = await loadEdgeCase("capabilities-unavailable");

    expect(edgeCase.brokenApiPath).toBe(true);
  });

  it.each(edgeCaseNavigation)("resolves facts for $id", async ({ id }) => {
    await expect(loadEdgeCase(id)).resolves.toMatchObject({
      id,
      facts: expect.any(Array),
    });
  });

  it("rejects a case outside the catalogue", async () => {
    await expect(loadEdgeCase("not-a-case")).rejects.toThrow(
      'Unknown edge case "not-a-case".',
    );
  });
});
