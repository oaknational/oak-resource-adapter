import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { ResourceDocument } from "@oaknational/resource-document";
import { beforeAll, describe, expect, it } from "vitest";

import { excludedLessonsRule } from "../rules/excluded-lessons";
import { defineRule } from "../rules/rule";
import { defineTransformation } from "./define-transformation";
import type { TransformationDeclaration } from "./define-transformation";
import { evaluateTransformation } from "./evaluate-transformation";
import { removingSupportLevels } from "./narrowing";
import type {
  TransformationAvailabilityContext,
  TransformationRuleContext,
} from "./types";

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

const ruleThat = (
  id: string,
  check: (context: TransformationRuleContext) => string | null,
) =>
  defineRule({
    id,
    kind: "test",
    description: "A rule under test.",
    config: {},
    check,
  });

const matchesAnyLesson = defineRule({
  id: "narrows",
  kind: "test",
  description: "A rule under test.",
  config: {},
  check: () => "matched",
});

const levelsOf = (context: TransformationRuleContext) =>
  context.definition.supportLevels?.map(({ level }) => level).join(",") ?? null;

describe("evaluateTransformation", () => {
  it("checks every kind's rules before the kind's own", () => {
    const definition = defineTransformation({
      ...declaration,
      status: "draft",
      rules: [ruleThat("own", () => "own")],
    });

    expect(evaluateTransformation(definition, contextFor())).toEqual({
      refusal: { level: "transformation", rule: "status", reason: "draft" },
    });
  });

  it("narrows rather than refuses, and later rules see the narrowed definition", () => {
    const seen: (string | null)[] = [];
    const definition = defineTransformation({
      ...declaration,
      rules: [
        removingSupportLevels(["mid"], matchesAnyLesson),
        ruleThat("records", (context) => {
          seen.push(levelsOf(context));
          return null;
        }),
      ],
    });

    const evaluation = evaluateTransformation(definition, contextFor());

    expect(seen).toEqual(["low"]);
    expect("offered" in evaluation && evaluation.offered.inputs).toEqual([
      expect.objectContaining({ options: [expect.objectContaining({ value: "low" })] }),
    ]);
  });

  it("refuses when narrowing would leave no level", () => {
    const definition = defineTransformation({
      ...declaration,
      rules: [removingSupportLevels(["low", "mid"], matchesAnyLesson)],
    });

    expect(evaluateTransformation(definition, contextFor())).toEqual({
      refusal: { level: "transformation", rule: "narrows", reason: "matched" },
    });
  });
});

describe("a shared kind at the transformation level", () => {
  it("refuses a listed lesson", () => {
    const definition = defineTransformation({
      ...declaration,
      rules: [
        excludedLessonsRule(
          { id: "excluded-lessons", description: "Test" },
          { lessonSlugs: ["joining-letters"] },
        ),
      ],
    });

    expect(
      evaluateTransformation(
        definition,
        contextFor({ lesson: { lessonSlug: "joining-letters" } }),
      ),
    ).toEqual({
      refusal: {
        level: "transformation",
        rule: "excluded-lessons",
        reason: "excluded-lesson",
      },
    });
  });
});
