import { describe, expect, it } from "vitest";

import { always } from "./availability";
import { defineTransformation } from "./define-transformation";

describe("defineTransformation", () => {
  it("refuses support levels on a kind offered without asking the agent", () => {
    expect(() =>
      defineTransformation({
        kind: "test-always-offered",
        label: "Always offered",
        status: "draft",
        suggestion: { description: "Test", offer: "always", reason: "Test" },
        target: { scope: "node", nodeTypes: ["task"] },
        outputs: ["revised-resource"],
        isAvailable: always,
        execution: { strategy: "deterministic", apply: (document) => [document] },
        supportLevels: [
          { description: "A little help.", label: "Add a little help", level: "low" },
        ],
      }),
    ).toThrow(/always offered/);
  });
});
