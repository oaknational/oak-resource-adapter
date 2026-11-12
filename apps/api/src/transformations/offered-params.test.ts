import type { TransformationInput } from "@oaknational/resource-adapter-contracts/internal";
import { describe, expect, it } from "vitest";

import { defineTransformation } from "./define-transformation";
import { offeredParamsSchema } from "./offered-params";

const declaration = {
  kind: "test-levelled",
  label: "Levelled",
  status: "active",
  suggestion: { description: "Test", useWhen: "Test", avoidWhen: "Test" },
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  rules: [],
  execution: {
    strategy: "deterministic",
    apply: (document) => [document],
  },
} as const satisfies Parameters<typeof defineTransformation>[0];

const low = { description: "Words.", label: "Add words", level: "low" } as const;
const mid = {
  description: "Words and meanings.",
  label: "Add words and meanings",
  level: "mid",
} as const;

const offering = (...values: string[]): TransformationInput[] => [
  {
    id: "supportLevel",
    kind: "choice",
    label: "Support level",
    options: values.map((value) => ({ description: value, label: value, value })),
  },
];

describe("offeredParamsSchema", () => {
  it("accepts only the choices that were offered", () => {
    const schema = offeredParamsSchema(
      defineTransformation({ ...declaration, supportLevels: [low, mid] }),
      offering("low"),
    );

    expect(schema.safeParse({ supportLevel: "low" }).success).toBe(true);
    expect(schema.safeParse({ supportLevel: "mid" }).success).toBe(false);
  });

  it("refuses an offered choice the definition no longer declares", () => {
    const schema = offeredParamsSchema(
      defineTransformation({ ...declaration, supportLevels: [low] }),
      offering("low", "mid"),
    );

    expect(schema.safeParse({ supportLevel: "low" }).success).toBe(true);
    expect(schema.safeParse({ supportLevel: "mid" }).success).toBe(false);
  });

  it("is the definition's own schema when nothing was offered", () => {
    const definition = defineTransformation({ ...declaration, supportLevels: [low] });

    expect(offeredParamsSchema(definition, [])).toBe(definition.params);
  });
});
