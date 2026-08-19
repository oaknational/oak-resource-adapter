import { describe, expect, it } from "vitest";

import { oakMaterialUsage } from "./oak-material-usage";
import type {
  OakMaterialSummary,
  TransformationCatalogueItem,
} from "./transformation-api";

const keywords: OakMaterialSummary = {
  available: true,
  key: "lesson.keywords",
  label: "Lesson keywords",
  promptHeading: "LESSON KEYWORDS",
};

const slides: OakMaterialSummary = {
  available: false,
  key: "lesson.slides",
  label: "Lesson slides",
  promptHeading: "LESSON SLIDES",
  unavailableBecause: "Slide content is not extracted yet.",
};

function transformation(
  label: string,
  requirements: TransformationCatalogueItem["materialRequirements"],
): TransformationCatalogueItem {
  return {
    execution: "structured-model",
    kind: label,
    label,
    materialRequirements: requirements,
    outputs: ["revised-resource"],
    status: "active",
    target: { scope: "document" },
  };
}

describe("oakMaterialUsage", () => {
  it("names the transformations asking for each part", () => {
    const usage = oakMaterialUsage(
      [keywords, slides],
      [
        transformation("Add a word bank", [
          {
            available: true,
            key: "lesson.keywords",
            label: "Lesson keywords",
            required: false,
          },
        ]),
        transformation("Add recall questions", [
          {
            available: false,
            key: "lesson.slides",
            label: "Lesson slides",
            required: true,
          },
        ]),
      ],
    );

    expect(usage[0]?.usedBy).toEqual([{ label: "Add a word bank", required: false }]);
    expect(usage[1]?.usedBy).toEqual([
      { label: "Add recall questions", required: true },
    ]);
  });

  it("keeps a part nothing asks for", () => {
    const [only] = oakMaterialUsage([slides], []);

    expect(only?.part.key).toBe("lesson.slides");
    expect(only?.usedBy).toEqual([]);
  });
});
