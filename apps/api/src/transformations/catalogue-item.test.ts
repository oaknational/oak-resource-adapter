import { describe, expect, it } from "vitest";

import { always } from "./availability";
import { defineTransformation } from "./define-transformation";
import { listRegisteredTransformations, toCatalogueItem } from "./service";
import type { TransformationMaterialRequirement } from "./oak-material/material";
import { transformationDefinitions } from "./registry";
import { glossaryContribution } from "./definitions/scaffold-add-glossary-question/contribution";
import { addWordBankPrompt } from "./definitions/scaffold-add-word-bank/prompt";

function deterministicWith(
  materialRequirements: readonly TransformationMaterialRequirement[] = [],
) {
  return defineTransformation({
    kind: "test-deterministic",
    label: "Deterministic",
    status: "draft",
    target: { scope: "document" },
    materialRequirements,
    outputs: ["revised-resource"],
    isAvailable: always,
    execution: { strategy: "deterministic", apply: (document) => [document] },
  });
}

const deterministic = deterministicWith();

const textModel = defineTransformation({
  kind: "test-text-model",
  label: "Text model",
  status: "draft",
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: { strategy: "model", prompt: addWordBankPrompt },
});

const structuredModel = defineTransformation({
  kind: "test-structured-model",
  label: "Structured model",
  status: "draft",
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: addWordBankPrompt,
    contribution: glossaryContribution,
  },
});

describe("toCatalogueItem", () => {
  it("distinguishes how a transformation runs", () => {
    expect(toCatalogueItem(deterministic).execution).toBe("deterministic");
    expect(toCatalogueItem(textModel).execution).toBe("text-model");
    expect(toCatalogueItem(structuredModel).execution).toBe("structured-model");
  });

  it("reports a part that can be read as available", () => {
    const item = toCatalogueItem(
      deterministicWith([{ key: "lesson.keywords", required: true }]),
    );

    expect(item.materialRequirements).toEqual([
      {
        available: true,
        key: "lesson.keywords",
        label: "Lesson keywords",
        required: true,
      },
    ]);
  });

  it("explains a part that cannot be read yet", () => {
    const item = toCatalogueItem(
      deterministicWith([{ key: "lesson.slides", required: false }]),
    );

    expect(item.materialRequirements[0]).toMatchObject({
      available: false,
      key: "lesson.slides",
      unavailableBecause: expect.stringContaining("not extracted yet"),
    });
  });

  it("reports no material for a transformation that declares none", () => {
    expect(toCatalogueItem(deterministic).materialRequirements).toEqual([]);
  });

  it("carries what the harness needs to describe a transformation", () => {
    expect(toCatalogueItem(structuredModel)).toMatchObject({
      kind: "test-structured-model",
      label: "Structured model",
      outputs: ["revised-resource"],
      status: "draft",
      target: { scope: "node", nodeTypes: ["question"] },
    });
  });
});

describe("listRegisteredTransformations", () => {
  it("lists every registered transformation, drafts included", () => {
    expect(listRegisteredTransformations().map(({ kind }) => kind)).toEqual(
      Object.keys(transformationDefinitions),
    );
    expect(
      listRegisteredTransformations().some(({ status }) => status === "draft"),
    ).toBe(true);
  });
});
