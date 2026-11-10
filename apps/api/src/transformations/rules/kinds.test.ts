import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { ResourceDocument } from "@oaknational/resource-document";
import { beforeAll, describe, expect, it } from "vitest";

import { defineTransformation } from "../define-transformation";
import type { TransformationDeclaration } from "../define-transformation";
import type { TransformationAvailabilityContext } from "../types";
import { appliedOncePerTargetRule } from "./applied-once-per-target";
import { keyStageRule } from "./key-stage";

let worksheet: ResourceDocument;

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
  });
});

const declaration = {
  kind: "test-levelled",
  label: "Levelled",
  status: "active",
  suggestion: { description: "Test", useWhen: "Test", avoidWhen: "Test" },
  target: { scope: "document" },
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

const contextFor = (
  overrides: Partial<TransformationAvailabilityContext> = {},
): TransformationAvailabilityContext => ({
  appliedTransformations: [],
  capabilityId: "worksheetScaffolding",
  document: worksheet,
  facts: null,
  lesson: null,
  ...overrides,
});

describe("appliedOncePerTargetRule", () => {
  const rule = appliedOncePerTargetRule({
    id: "applied-once-per-target",
    description: "Test",
  });
  const definition = defineTransformation({ ...declaration, rules: [rule] });
  const appliedTo = (targetBlockId: string) => [
    { kind: definition.kind, params: {}, targetBlockId: "question-1" },
    { kind: "test-other", params: {}, targetBlockId },
  ];

  it("refuses the same kind on the same target only", () => {
    const check = (targetBlockId: string) =>
      rule.check({
        ...contextFor({ appliedTransformations: appliedTo("question-2") }),
        definition,
        targetBlockId,
      });

    expect(check("question-1")).toBe("already-applied");
    expect(check("question-2")).toBeNull();
  });
});

describe("keyStageRule", () => {
  const rule = keyStageRule(
    { id: "key-stage", description: "Test" },
    { keyStageSlugs: ["ks3"] },
  );

  it("reads the key stage the resource records", () => {
    expect(worksheet.metadata).toMatchObject({
      keyStage: { id: expect.stringMatching(/ks2/i) },
    });
    expect(rule.check({ document: worksheet })).toBe("unsupported-key-stage");
    expect(
      keyStageRule(
        { id: "key-stage", description: "Test" },
        { keyStageSlugs: ["ks2"] },
      ).check({
        document: worksheet,
      }),
    ).toBeNull();
  });
});
