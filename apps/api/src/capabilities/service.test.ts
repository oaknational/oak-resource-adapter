import { describe, expect, it } from "vitest";

import { evaluateCapabilities, getCapabilities } from "./service";
import type { CapabilityDefinition, EligibilityContext } from "./types";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";

const worksheetLesson: LessonContext = {
  lessonSlug: "adding-fractions",
  programmeSlug: "ks2-maths",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
};

const quizOnlyLesson: LessonContext = {
  ...worksheetLesson,
  availableResources: ["starter-quiz"],
};

const worksheetGatedCapability: CapabilityDefinition = {
  id: "test-worksheet-capability",
  label: "Worksheet capability",
  resourceType: "worksheet",
  isEligible: ({ lesson }) => lesson.availableResources.includes("worksheet"),
};

const starterQuizGatedCapability: CapabilityDefinition = {
  id: "test-starter-quiz-capability",
  label: "Starter quiz capability",
  resourceType: "starter-quiz",
  isEligible: ({ lesson }) => lesson.availableResources.includes("starter-quiz"),
};

const testDefinitions: ReadonlyArray<CapabilityDefinition> = [
  worksheetGatedCapability,
  starterQuizGatedCapability,
];

describe("getCapabilities", () => {
  it("returns the scaffolded practice sheet capability for a lesson with a worksheet", () => {
    expect(getCapabilities(worksheetLesson)).toEqual({
      capabilities: [
        {
          id: "worksheetAdapter",
          label: "Scaffolded Practice Sheet",
          resourceType: "worksheet",
        },
      ],
    });
  });

  it("returns no capabilities for a lesson without a worksheet", () => {
    expect(getCapabilities(quizOnlyLesson)).toEqual({ capabilities: [] });
  });

  it("excludes eligibility predicates from the response", () => {
    const { capabilities } = getCapabilities(worksheetLesson);

    expect(capabilities[0]).not.toHaveProperty("isEligible");
  });
});

describe("evaluateCapabilities", () => {
  it("evaluates each definition's predicate independently", () => {
    const response = evaluateCapabilities(testDefinitions, { lesson: quizOnlyLesson });

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
    const bothResourcesLesson: LessonContext = {
      ...worksheetLesson,
      availableResources: ["worksheet", "starter-quiz"],
    };

    const response = evaluateCapabilities(testDefinitions, {
      lesson: bothResourcesLesson,
    });

    expect(response.capabilities.map((capability) => capability.id)).toEqual([
      "test-worksheet-capability",
      "test-starter-quiz-capability",
    ]);
  });

  it("passes the eligibility context through to predicates", () => {
    // worksheetFacts stands in for a derived fact the production context does not
    // carry; the cast keeps the stub out of the production context type.
    type StubEligibilityContext = EligibilityContext &
      Readonly<{ worksheetFacts: Readonly<{ questionCount: number }> }>;

    const questionCountCapability: CapabilityDefinition = {
      id: "test-question-count-capability",
      label: "Question count capability",
      resourceType: "worksheet",
      isEligible: (context) =>
        (context as StubEligibilityContext).worksheetFacts.questionCount > 0,
    };

    const contextWithQuestions: StubEligibilityContext = {
      lesson: worksheetLesson,
      worksheetFacts: { questionCount: 3 },
    };
    const contextWithoutQuestions: StubEligibilityContext = {
      lesson: worksheetLesson,
      worksheetFacts: { questionCount: 0 },
    };

    expect(
      evaluateCapabilities([questionCountCapability], contextWithQuestions)
        .capabilities,
    ).toHaveLength(1);
    expect(
      evaluateCapabilities([questionCountCapability], contextWithoutQuestions)
        .capabilities,
    ).toEqual([]);
  });
});
