import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { getResourceNodesByType } from "@oaknational/resource-document";
import { beforeAll, describe, expect, it } from "vitest";

import type { ResourceDocument } from "@oaknational/resource-document";

import { worksheetAdapterCapability } from "../capabilities/definitions/worksheet-adapter";
import { defineTransformation } from "./define-transformation";
import {
  evaluateTransformations,
  listTransformationsForCapability,
  transformationsForCapability,
} from "./service";

import type { TransformationAvailabilityContext } from "./types";

let worksheet: ResourceDocument;

function contextFor(
  capabilityId = "worksheetAdapter",
): TransformationAvailabilityContext {
  return { appliedTransformations: [], capabilityId, document: worksheet };
}

const offered = defineTransformation({
  kind: "test-offered",
  label: "Offered",
  status: "active",
  target: { scope: "document" },
  outputs: ["revised-resource"],
  isAvailable: () => true,
  execution: { strategy: "deterministic", apply: (document) => [document] },
});

const withheld = defineTransformation({
  kind: "test-withheld",
  label: "Withheld",
  status: "active",
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
      transformationsForCapability("worksheetAdapter").map(({ kind }) => kind),
    ).toEqual([...worksheetAdapterCapability.transformations]);
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
    const kinds = listTransformationsForCapability(contextFor()).map(
      ({ kind }) => kind,
    );

    expect(kinds).not.toContain("scaffold-add-prompt-questions");
    expect(kinds).not.toContain("scaffold-add-prompt-reminders");
    expect(kinds).not.toContain("scaffold-add-knowledge-summary");
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
