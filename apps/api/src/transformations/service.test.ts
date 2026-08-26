import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { getResourceNodesByType } from "@oaknational/resource-document";
import { beforeAll, describe, expect, it } from "vitest";

import type { ResourceDocument } from "@oaknational/resource-document";

import { worksheetScaffoldingCapability } from "../capabilities/definitions/worksheet-scaffolding";
import { defineTransformation } from "./define-transformation";
import { transformationDefinitions } from "./registry";
import {
  evaluateTransformations,
  listTransformationsForCapability,
  transformationsForCapability,
} from "./service";

import type { TransformationAvailabilityContext } from "./types";

let worksheet: ResourceDocument;

function contextFor(
  capabilityId = "worksheetScaffolding",
): TransformationAvailabilityContext {
  return { appliedTransformations: [], capabilityId, document: worksheet };
}

const offered = defineTransformation({
  kind: "test-offered",
  label: "Offered",
  status: "active",
  suggestion: { description: "Test", useWhen: "Test", avoidWhen: "Test" },
  target: { scope: "document" },
  outputs: ["revised-resource"],
  isAvailable: () => true,
  execution: { strategy: "deterministic", apply: (document) => [document] },
});

const withheld = defineTransformation({
  kind: "test-withheld",
  label: "Withheld",
  status: "active",
  suggestion: { description: "Test", useWhen: "Test", avoidWhen: "Test" },
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  isAvailable: () => false,
  execution: { strategy: "deterministic", apply: (document) => [document] },
});

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
  });
});

describe("evaluateTransformations", () => {
  it("returns only the kinds whose rules hold", () => {
    expect(evaluateTransformations([offered, withheld], contextFor())).toEqual([
      {
        kind: "test-offered",
        label: "Offered",
        outputs: ["revised-resource"],
        suggestion: { description: "Test", useWhen: "Test", avoidWhen: "Test" },
        target: { scope: "document" },
      },
    ]);
  });

  it("preserves the order it was given", () => {
    const second = { ...offered, kind: "test-offered-second" };

    expect(
      evaluateTransformations([offered, second], contextFor()).map(({ kind }) => kind),
    ).toEqual(["test-offered", "test-offered-second"]);
  });

  it("excludes rules and prompts from the listing", () => {
    const [transformation] = evaluateTransformations([offered], contextFor());

    expect(transformation).not.toHaveProperty("isAvailable");
    expect(transformation).not.toHaveProperty("execution");
    expect(transformation).not.toHaveProperty("params");
  });
});

describe("transformationsForCapability", () => {
  it("resolves the kinds the worksheet capability declares, in order", () => {
    expect(
      transformationsForCapability("worksheetScaffolding").map(({ kind }) => kind),
    ).toEqual(
      worksheetScaffoldingCapability.transformationKinds.filter(
        (kind) => transformationDefinitions[kind].status === "active",
      ),
    );
  });

  it("rejects an unknown capability rather than offering nothing", () => {
    expect(() => transformationsForCapability("notACapability")).toThrow(
      /notACapability/,
    );
  });
});

describe("listTransformationsForCapability", () => {
  it("lists what a teacher needs to choose a kind", () => {
    expect(listTransformationsForCapability(contextFor())).toContainEqual({
      barriers: ["working-memory", "gaps-in-knowledge"],
      kind: "scaffold-add-word-bank",
      label: "Add a word bank",
      outputs: ["revised-resource"],
      suggestion: {
        description:
          "Adds the vocabulary a pupil needs for one question, with optional definitions and examples.",
        useWhen:
          "Answering the question depends on recalling or selecting relevant subject vocabulary.",
        avoidWhen:
          "The question already supplies the vocabulary, or vocabulary is not the barrier to answering it.",
      },
      supportLevels: [
        {
          level: "low",
          description: "Lists the words a pupil needs, without definitions.",
        },
        {
          level: "mid",
          description: "Lists the words with a short definition of each.",
        },
        {
          level: "high",
          description:
            "Lists the words with a definition and an example of each in use.",
        },
      ],
      target: { scope: "node", nodeTypes: ["question"] },
    });
  });

  it("names the companion document a kind produces instead of a revision", () => {
    const companion = { ...offered, outputs: ["companion-document"] } as typeof offered;

    expect(evaluateTransformations([companion], contextFor())[0]?.outputs).toEqual([
      "companion-document",
    ]);
  });

  it("withholds the kinds that cannot run yet", () => {
    const offeredKinds = listTransformationsForCapability(contextFor()).map(
      ({ kind }) => kind,
    );
    // Named by status rather than by kind, so activating one does not make this
    // assert the opposite of what it means.
    const draftKinds = worksheetScaffoldingCapability.transformationKinds.filter(
      (kind) => transformationDefinitions[kind].status === "draft",
    );

    expect(draftKinds.length).toBeGreaterThan(0);
    expect(offeredKinds).toEqual(expect.not.arrayContaining(draftKinds));
  });

  it("withdraws an additive kind already applied to the selected target", () => {
    const [question] = getResourceNodesByType(worksheet, "question");
    expect(question).toBeDefined();
    if (question === undefined) return;

    const context = {
      ...contextFor(),
      appliedTransformations: [
        {
          kind: "scaffold-add-word-bank",
          params: { supportLevel: "low" },
          targetBlockId: question.id,
        },
      ],
      targetBlockId: question.id,
    };

    expect(
      listTransformationsForCapability(context).map(({ kind }) => kind),
    ).not.toContain("scaffold-add-word-bank");
  });

  it("rejects an unknown capability", () => {
    expect(() =>
      listTransformationsForCapability(contextFor("notACapability")),
    ).toThrow(/notACapability/);
  });
});
