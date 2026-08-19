import { describe, expect, it } from "vitest";

import {
  evaluateCapabilities,
  getCapabilities,
  resolveEligibility,
  type EligibilityResolver,
} from "./service";
import { isAdaptable, type CapabilityDefinition } from "./types";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";

const worksheetLesson: LessonContext = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
  title: "Adopting different perspectives",
  subjectSlug: "english",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
};

const quizOnlyLesson: LessonContext = {
  ...worksheetLesson,
  availableResources: ["starter-quiz"],
};

function resolverFor(
  originalFileResourceTypes: readonly string[],
  extractedResourceTypes: readonly string[],
): EligibilityResolver {
  return (lesson) =>
    Promise.resolve({ lesson, originalFileResourceTypes, extractedResourceTypes });
}

const worksheetGatedCapability: CapabilityDefinition = {
  id: "test-worksheet-capability",
  label: "Worksheet capability",
  resourceType: "worksheet",
  isEligible: (context) => isAdaptable(context, "worksheet"),
  transformations: ["identity"],
};

const starterQuizGatedCapability: CapabilityDefinition = {
  id: "test-starter-quiz-capability",
  label: "Starter quiz capability",
  resourceType: "starter-quiz",
  isEligible: (context) => isAdaptable(context, "starter-quiz"),
  transformations: ["identity"],
};

const testDefinitions: ReadonlyArray<CapabilityDefinition> = [
  worksheetGatedCapability,
  starterQuizGatedCapability,
];

describe("getCapabilities", () => {
  it("returns the scaffolded practice sheet capability for an adaptable worksheet", async () => {
    await expect(
      getCapabilities(worksheetLesson, resolverFor(["worksheet"], ["worksheet"])),
    ).resolves.toEqual({
      capabilities: [
        {
          id: "worksheetAdapter",
          label: "Scaffolded Practice Sheet",
          resourceType: "worksheet",
        },
      ],
    });
  });

  it("returns no capabilities for a lesson without an original worksheet file", async () => {
    await expect(
      getCapabilities(quizOnlyLesson, resolverFor(["starter-quiz"], ["worksheet"])),
    ).resolves.toEqual({ capabilities: [] });
  });

  it("returns no capabilities when no extraction exists", async () => {
    await expect(
      getCapabilities(worksheetLesson, resolverFor(["worksheet"], [])),
    ).resolves.toEqual({ capabilities: [] });
  });

  it("excludes eligibility predicates from the response", async () => {
    const { capabilities } = await getCapabilities(
      worksheetLesson,
      resolverFor(["worksheet"], ["worksheet"]),
    );

    expect(capabilities[0]).not.toHaveProperty("isEligible");
  });

  it("excludes the capability's transformation kinds from the response", async () => {
    const { capabilities } = await getCapabilities(
      worksheetLesson,
      resolverFor(["worksheet"], ["worksheet"]),
    );

    expect(capabilities[0]).not.toHaveProperty("transformations");
  });
});

describe("resolveEligibility", () => {
  it("reads extracted resource types from the fixture corpus", async () => {
    await expect(resolveEligibility(worksheetLesson)).resolves.toMatchObject({
      originalFileResourceTypes: ["worksheet"],
      extractedResourceTypes: ["worksheet"],
    });
  });

  it("reports no extracted resource types for a lesson outside the corpus", async () => {
    await expect(
      resolveEligibility({ ...worksheetLesson, lessonSlug: "not-a-lesson" }),
    ).resolves.toMatchObject({ extractedResourceTypes: [] });
  });
});

describe("evaluateCapabilities", () => {
  it("evaluates each definition's predicate independently", () => {
    const response = evaluateCapabilities(testDefinitions, {
      lesson: quizOnlyLesson,
      originalFileResourceTypes: ["starter-quiz"],
      extractedResourceTypes: ["starter-quiz"],
    });

    expect(response).toEqual({
      capabilities: [
        {
          id: "test-starter-quiz-capability",
          label: "Starter quiz capability",
          resourceType: "starter-quiz",
        },
      ],
    });
  });

  it("preserves definition order in the response", () => {
    const response = evaluateCapabilities(testDefinitions, {
      lesson: worksheetLesson,
      originalFileResourceTypes: ["worksheet", "starter-quiz"],
      extractedResourceTypes: ["worksheet", "starter-quiz"],
    });

    expect(response.capabilities.map((capability) => capability.id)).toEqual([
      "test-worksheet-capability",
      "test-starter-quiz-capability",
    ]);
  });

  it("requires both an original file and an extraction", () => {
    const originalFileOnly = evaluateCapabilities([worksheetGatedCapability], {
      lesson: worksheetLesson,
      originalFileResourceTypes: ["worksheet"],
      extractedResourceTypes: [],
    });
    const extractionOnly = evaluateCapabilities([worksheetGatedCapability], {
      lesson: worksheetLesson,
      originalFileResourceTypes: [],
      extractedResourceTypes: ["worksheet"],
    });

    expect(originalFileOnly.capabilities).toEqual([]);
    expect(extractionOnly.capabilities).toEqual([]);
  });
});
