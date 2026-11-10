import { describe, expect, it } from "vitest";

import { defineRule } from "../rules/rule";
import { defineTransformation } from "./define-transformation";
import { withoutSupportLevels } from "./narrowing";
import type { TransformationDeclaration } from "./define-transformation";

const levelled = {
  kind: "test-levelled",
  label: "Levelled",
  status: "active",
  suggestion: { description: "Test", useWhen: "Test", avoidWhen: "Test" },
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  rules: [],
  execution: { strategy: "deterministic", apply: (document) => [document] },
  supportLevels: [
    { description: "Words.", label: "Add words", level: "low" },
    {
      description: "Words and meanings.",
      label: "Add words and meanings",
      level: "mid",
    },
  ],
} as const satisfies TransformationDeclaration;

const refusesEverything = defineRule({
  id: "test-narrowing",
  kind: "test",
  description: "A rule under test.",
  config: {},
  check: () => "matched",
});

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
        rules: [],
        execution: { strategy: "deterministic", apply: (document) => [document] },
        supportLevels: [
          { description: "A little help.", label: "Add a little help", level: "low" },
        ],
      }),
    ).toThrow(/always offered/);
  });

  it("refuses a rule that removes a level the kind does not declare", () => {
    expect(() =>
      defineTransformation({
        ...levelled,
        rules: [{ ...refusesEverything, removesSupportLevels: ["high"] }],
      }),
    ).toThrow(/test-narrowing rule removes a level/);
  });
});

describe("withoutSupportLevels", () => {
  const definition = defineTransformation(levelled);

  it("narrows the levels, the teacher's choice and the params together", () => {
    const narrowed = withoutSupportLevels(definition, ["mid"]);

    expect(narrowed?.supportLevels?.map(({ level }) => level)).toEqual(["low"]);
    expect(narrowed?.inputs?.[0]?.options.map(({ value }) => value)).toEqual(["low"]);
    expect(narrowed?.params.safeParse({ supportLevel: "low" }).success).toBe(true);
    expect(narrowed?.params.safeParse({ supportLevel: "mid" }).success).toBe(false);
  });

  it("leaves nothing to offer when every level is removed", () => {
    expect(withoutSupportLevels(definition, ["low", "mid"])).toBeNull();
  });
});
