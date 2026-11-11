import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  createOakLessonEligibilityFactsReader,
  LessonEligibilityFacts,
} from "@oaknational/resource-adapter-curriculum";

const { readFacts } = vi.hoisted(() => ({
  readFacts: vi.fn<ReturnType<typeof createOakLessonEligibilityFactsReader>>(),
}));

vi.mock("@oaknational/resource-adapter-curriculum", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@oaknational/resource-adapter-curriculum")
  >()),
  oakCurriculumConfigFromEnv: () => ({
    endpoint: "https://curriculum.test",
    apiKey: "test",
  }),
  createOakLessonEligibilityFactsReader: () => readFacts,
}));

vi.mock("../teacher-access/resolver", () => ({
  teacherAccessResolver: {
    resolve: () =>
      Promise.resolve({
        onboarded: true,
        termsAccepted: true,
        tier: "full",
        inCopyrightRegion: true,
      }),
  },
}));

import {
  evaluateCapabilities,
  explainEligibility,
  getCapabilities,
  hasCapabilities,
  readEligibilityContext,
  type EligibilityContextReader,
} from "./service";
import { resourceInputsRule } from "./resource-inputs";
import type { CapabilityDefinition } from "./types";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import type { TeacherAccess } from "../teacher-access/access";

const unrestricted: LessonEligibilityFacts = {
  restrictionLevels: { works: [], media: [], downloadableFiles: [], featureKeys: [] },
  subjectSlugs: ["english"],
  subjectCategories: [],
  legacy: false,
  contentGuidance: [],
};

function withRestrictionLevels(
  levels: Partial<NonNullable<LessonEligibilityFacts["restrictionLevels"]>>,
): LessonEligibilityFacts {
  return {
    ...unrestricted,
    restrictionLevels: { ...unrestricted.restrictionLevels!, ...levels },
  };
}

beforeEach(() => {
  readFacts.mockReset().mockResolvedValue(unrestricted);
});

const teacher = { organisationId: null, teacherId: "teacher-456" };

function accessResolving(access: TeacherAccess) {
  return { resolve: vi.fn().mockResolvedValue(access) };
}

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
  facts: LessonEligibilityFacts | null = unrestricted,
): EligibilityContextReader {
  return (lesson) =>
    Promise.resolve({
      lesson,
      facts,
      originalFileResourceTypes,
      extractedResourceTypes,
    });
}

const worksheetGatedCapability: CapabilityDefinition = {
  id: "test-worksheet-capability",
  label: "Worksheet capability",
  resourceType: "worksheet",
  rules: [
    resourceInputsRule(
      {
        id: "resource-inputs",
        label: "Test",
        description: "A rule under test.",
        condition: "Test",
      },
      { resourceType: "worksheet" },
    ),
  ],
  transformationKinds: ["identity"],
};

const starterQuizGatedCapability: CapabilityDefinition = {
  id: "test-starter-quiz-capability",
  label: "Starter quiz capability",
  resourceType: "starter-quiz",
  rules: [
    resourceInputsRule(
      {
        id: "resource-inputs",
        label: "Test",
        description: "A rule under test.",
        condition: "Test",
      },
      { resourceType: "starter-quiz" },
    ),
  ],
  transformationKinds: ["identity"],
};

const testDefinitions: ReadonlyArray<CapabilityDefinition> = [
  worksheetGatedCapability,
  starterQuizGatedCapability,
];

describe("getCapabilities", () => {
  it("returns the extra scaffolding capability for an adaptable worksheet", async () => {
    await expect(
      getCapabilities(
        worksheetLesson,
        teacher,
        resolverFor(["worksheet"], ["worksheet"]),
      ),
    ).resolves.toEqual({
      account: { state: "ready", tier: "full", inCopyrightRegion: true },
      capabilities: [
        {
          id: "worksheetScaffolding",
          label: "Add extra scaffolding",
          resourceType: "worksheet",
        },
      ],
    });
  });

  it("returns no capabilities for a lesson without an original worksheet file", async () => {
    await expect(
      getCapabilities(
        quizOnlyLesson,
        teacher,
        resolverFor(["starter-quiz"], ["worksheet"]),
      ),
    ).resolves.toMatchObject({ capabilities: [] });
  });

  it("returns no capabilities when no extraction exists", async () => {
    await expect(
      getCapabilities(worksheetLesson, teacher, resolverFor(["worksheet"], [])),
    ).resolves.toMatchObject({ capabilities: [] });
  });

  it("excludes eligibility predicates from the response", async () => {
    const { capabilities } = await getCapabilities(
      worksheetLesson,
      teacher,
      resolverFor(["worksheet"], ["worksheet"]),
    );

    expect(capabilities[0]).not.toHaveProperty("rules");
  });

  it("excludes the capability's transformation kinds from the response", async () => {
    const { capabilities } = await getCapabilities(
      worksheetLesson,
      teacher,
      resolverFor(["worksheet"], ["worksheet"]),
    );

    expect(capabilities[0]).not.toHaveProperty("transformations");
  });

  it("reports needsSetup without reading the lesson for a teacher who is not onboarded", async () => {
    const readContext = vi.fn<EligibilityContextReader>();

    await expect(
      getCapabilities(
        worksheetLesson,
        teacher,
        readContext,
        accessResolving({
          onboarded: false,
          termsAccepted: true,
          tier: "full",
          inCopyrightRegion: true,
        }),
      ),
    ).resolves.toEqual({ account: { state: "needsSetup" }, capabilities: [] });
    expect(readContext).not.toHaveBeenCalled();
  });

  it("reports the tier and copyright region of an onboarded teacher", async () => {
    const { account } = await getCapabilities(
      worksheetLesson,
      teacher,
      resolverFor(["worksheet"], ["worksheet"]),
      accessResolving({
        onboarded: true,
        termsAccepted: true,
        tier: "limited",
        inCopyrightRegion: false,
      }),
    );

    expect(account).toEqual({
      state: "ready",
      tier: "limited",
      inCopyrightRegion: false,
    });
  });

  it("fails when the teacher's access cannot be looked up", async () => {
    const error = new Error("Clerk unavailable");

    await expect(
      getCapabilities(
        worksheetLesson,
        teacher,
        resolverFor(["worksheet"], ["worksheet"]),
        {
          resolve: vi.fn().mockRejectedValue(error),
        },
      ),
    ).rejects.toBe(error);
  });
});

describe("readEligibilityContext", () => {
  it.each(["restricted", "highly-restricted"] as const)(
    "uses Oak's %s result in both capability endpoints",
    async (maxLevel) => {
      readFacts.mockResolvedValue(withRestrictionLevels({ works: [maxLevel] }));

      await expect(getCapabilities(worksheetLesson, teacher)).resolves.toMatchObject({
        capabilities: [],
      });
      await expect(hasCapabilities(worksheetLesson)).resolves.toEqual({
        available: false,
      });
      expect(readFacts).toHaveBeenCalledTimes(2);
      expect(readFacts).toHaveBeenNthCalledWith(1, worksheetLesson);
      expect(readFacts).toHaveBeenNthCalledWith(2, worksheetLesson);
    },
  );

  it("does not offer capabilities when the facts lookup fails", async () => {
    const error = new Error("Curriculum unavailable");
    readFacts.mockRejectedValue(error);

    await expect(getCapabilities(worksheetLesson, teacher)).rejects.toBe(error);
    await expect(hasCapabilities(worksheetLesson)).rejects.toBe(error);
  });

  it("reads extracted resource types from the fixture corpus", async () => {
    await expect(readEligibilityContext(worksheetLesson)).resolves.toMatchObject({
      facts: unrestricted,
      originalFileResourceTypes: ["worksheet"],
      extractedResourceTypes: ["worksheet"],
    });
  });

  it("reports no extracted resource types for a lesson outside the corpus", async () => {
    await expect(
      readEligibilityContext({ ...worksheetLesson, lessonSlug: "not-a-lesson" }),
    ).resolves.toMatchObject({ extractedResourceTypes: [] });
  });
});

describe("explainEligibility", () => {
  const context = {
    lesson: quizOnlyLesson,
    facts: unrestricted,
    originalFileResourceTypes: ["starter-quiz", "worksheet"],
    extractedResourceTypes: ["starter-quiz"],
  };

  it("names the rule that refused each capability", () => {
    expect(explainEligibility(testDefinitions, context, undefined)).toEqual({
      lesson: null,
      capabilities: [
        {
          id: "test-worksheet-capability",
          refusal: {
            level: "capability",
            rule: "resource-inputs",
            reason: "not-extracted",
          },
        },
        { id: "test-starter-quiz-capability", refusal: null },
      ],
    });
  });

  it("checks no capability on a refused lesson", () => {
    expect(
      explainEligibility(testDefinitions, { ...context, facts: null }, undefined),
    ).toEqual({
      lesson: { level: "lesson", rule: "lesson-status", reason: "unpublished" },
      capabilities: [],
    });
  });
});

describe("evaluateCapabilities", () => {
  it("evaluates each definition's rules independently", () => {
    const response = evaluateCapabilities(
      testDefinitions,
      {
        lesson: quizOnlyLesson,
        facts: unrestricted,
        originalFileResourceTypes: ["starter-quiz"],
        extractedResourceTypes: ["starter-quiz"],
      },
      undefined,
    );

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
    const response = evaluateCapabilities(
      testDefinitions,
      {
        lesson: worksheetLesson,
        facts: unrestricted,
        originalFileResourceTypes: ["worksheet", "starter-quiz"],
        extractedResourceTypes: ["worksheet", "starter-quiz"],
      },
      undefined,
    );

    expect(response.capabilities.map((capability) => capability.id)).toEqual([
      "test-worksheet-capability",
      "test-starter-quiz-capability",
    ]);
  });

  it("requires both an original file and an extraction", () => {
    const originalFileOnly = evaluateCapabilities(
      [worksheetGatedCapability],
      {
        lesson: worksheetLesson,
        facts: unrestricted,
        originalFileResourceTypes: ["worksheet"],
        extractedResourceTypes: [],
      },
      undefined,
    );
    const extractionOnly = evaluateCapabilities(
      [worksheetGatedCapability],
      {
        lesson: worksheetLesson,
        facts: unrestricted,
        originalFileResourceTypes: [],
        extractedResourceTypes: ["worksheet"],
      },
      undefined,
    );

    expect(originalFileOnly.capabilities).toEqual([]);
    expect(extractionOnly.capabilities).toEqual([]);
  });
});

describe("hasCapabilities", () => {
  it("reports availability without naming the capabilities", async () => {
    await expect(
      hasCapabilities(worksheetLesson, resolverFor(["worksheet"], ["worksheet"])),
    ).resolves.toEqual({ available: true });
  });

  it("reports nothing available when the lesson is not eligible", async () => {
    await expect(
      hasCapabilities(quizOnlyLesson, resolverFor(["starter-quiz"], [])),
    ).resolves.toEqual({ available: false });
  });

  it("counts only capabilities the caller says it can render", async () => {
    await expect(
      hasCapabilities(
        { ...worksheetLesson, supportedCapabilityIds: ["somethingElse"] },
        resolverFor(["worksheet"], ["worksheet"]),
      ),
    ).resolves.toEqual({ available: false });
  });

  it("counts every capability when the caller does not say", async () => {
    await expect(
      hasCapabilities(worksheetLesson, resolverFor(["worksheet"], ["worksheet"])),
    ).resolves.toEqual({ available: true });
  });
});

describe("capability lesson rules", () => {
  const adaptable = (facts: LessonEligibilityFacts | null) =>
    resolverFor(["worksheet"], ["worksheet"], facts);

  it("offers a lesson the rules allow on both endpoints", async () => {
    const facts = withRestrictionLevels({
      works: ["ogl-compatible"],
      media: ["ogl-equivalent"],
    });

    await expect(
      getCapabilities(worksheetLesson, teacher, adaptable(facts)),
    ).resolves.toMatchObject({ capabilities: [{ id: "worksheetScaffolding" }] });
    await expect(hasCapabilities(worksheetLesson, adaptable(facts))).resolves.toEqual({
      available: true,
    });
  });

  it.each([
    ["restricted works", withRestrictionLevels({ works: ["restricted"] })],
    [
      "a copyright conflict",
      withRestrictionLevels({ featureKeys: ["has_copyright_conflict"] }),
    ],
    ["an excluded subject", { ...unrestricted, subjectSlugs: ["english", "music"] }],
    ["a handwriting lesson", { ...unrestricted, subjectCategories: ["Handwriting"] }],
    ["a spelling lesson", { ...unrestricted, subjectCategories: ["Spelling"] }],
    ["an expired lesson", withRestrictionLevels({ featureKeys: ["expired"] })],
    ["a legacy lesson", { ...unrestricted, legacy: true }],
    ["a lesson Oak does not publish in the programme", null],
  ])("offers nothing for %s, signed in or out", async (_, facts) => {
    await expect(
      getCapabilities(worksheetLesson, teacher, adaptable(facts)),
    ).resolves.toMatchObject({ capabilities: [] });
    await expect(hasCapabilities(worksheetLesson, adaptable(facts))).resolves.toEqual({
      available: false,
    });
  });

  describe("for a geo-restricted lesson", () => {
    const geoRestricted = adaptable(
      withRestrictionLevels({ featureKeys: ["agf__geo_restricted"] }),
    );

    it("offers the capability to a teacher in a copyright region", async () => {
      const access = accessResolving({
        onboarded: true,
        termsAccepted: true,
        tier: "full",
        inCopyrightRegion: true,
      });

      const { capabilities } = await getCapabilities(
        worksheetLesson,
        teacher,
        geoRestricted,
        access,
      );

      expect(capabilities).toHaveLength(1);
      expect(access.resolve).toHaveBeenCalledWith(teacher.teacherId);
    });

    it.each<[string, TeacherAccess]>([
      [
        "a teacher outside the copyright regions",
        {
          onboarded: true,
          termsAccepted: true,
          tier: "limited",
          inCopyrightRegion: false,
        },
      ],
      [
        "a granted teacher outside the copyright regions",
        {
          onboarded: true,
          termsAccepted: true,
          tier: "full",
          inCopyrightRegion: false,
        },
      ],
    ])("offers nothing to %s", async (_, access) => {
      await expect(
        getCapabilities(
          worksheetLesson,
          teacher,
          geoRestricted,
          accessResolving(access),
        ),
      ).resolves.toMatchObject({ capabilities: [] });
    });

    it("reports availability when signed out", async () => {
      await expect(hasCapabilities(worksheetLesson, geoRestricted)).resolves.toEqual({
        available: true,
      });
    });
  });
});
