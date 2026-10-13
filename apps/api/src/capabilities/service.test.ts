import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  createOakLessonRightsReader,
  LessonRights,
} from "@oaknational/resource-adapter-curriculum";

const { readRights } = vi.hoisted(() => ({
  readRights: vi.fn<ReturnType<typeof createOakLessonRightsReader>>(),
}));

vi.mock("@oaknational/resource-adapter-curriculum", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@oaknational/resource-adapter-curriculum")
  >()),
  oakCurriculumConfigFromEnv: () => ({
    endpoint: "https://curriculum.test",
    apiKey: "test",
  }),
  createOakLessonRightsReader: () => readRights,
}));

import {
  evaluateCapabilities,
  getCapabilities,
  hasCapabilities,
  resolveEligibility,
  type EligibilityResolver,
} from "./service";
import { hasResourceInputs, type CapabilityDefinition } from "./types";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import type { TeacherAccess } from "../teacher-access/access";

const unrestricted: LessonRights = {
  maxRestrictions: [],
  copyrightRestricted: false,
  legacyCopyright: false,
  expired: false,
  geoRestricted: false,
};

beforeEach(() => {
  readRights.mockReset().mockResolvedValue(unrestricted);
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
  rights: LessonRights | null = unrestricted,
): EligibilityResolver {
  return (lesson) =>
    Promise.resolve({
      lesson,
      rights,
      originalFileResourceTypes,
      extractedResourceTypes,
    });
}

const worksheetGatedCapability: CapabilityDefinition = {
  id: "test-worksheet-capability",
  label: "Worksheet capability",
  resourceType: "worksheet",
  isEligible: (context) => hasResourceInputs(context, "worksheet"),
  transformationKinds: ["identity"],
};

const starterQuizGatedCapability: CapabilityDefinition = {
  id: "test-starter-quiz-capability",
  label: "Starter quiz capability",
  resourceType: "starter-quiz",
  isEligible: (context) => hasResourceInputs(context, "starter-quiz"),
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
    ).resolves.toEqual({ capabilities: [] });
  });

  it("returns no capabilities when no extraction exists", async () => {
    await expect(
      getCapabilities(worksheetLesson, teacher, resolverFor(["worksheet"], [])),
    ).resolves.toEqual({ capabilities: [] });
  });

  it("excludes eligibility predicates from the response", async () => {
    const { capabilities } = await getCapabilities(
      worksheetLesson,
      teacher,
      resolverFor(["worksheet"], ["worksheet"]),
    );

    expect(capabilities[0]).not.toHaveProperty("isEligible");
  });

  it("excludes the capability's transformation kinds from the response", async () => {
    const { capabilities } = await getCapabilities(
      worksheetLesson,
      teacher,
      resolverFor(["worksheet"], ["worksheet"]),
    );

    expect(capabilities[0]).not.toHaveProperty("transformations");
  });
});

describe("resolveEligibility", () => {
  it.each(["restricted", "highly-restricted"] as const)(
    "uses Oak's %s result in both capability endpoints",
    async (maxLevel) => {
      readRights.mockResolvedValue({
        ...unrestricted,
        maxRestrictions: [{ category: "works", maxLevel }],
      });

      await expect(getCapabilities(worksheetLesson, teacher)).resolves.toEqual({
        capabilities: [],
      });
      await expect(hasCapabilities(worksheetLesson)).resolves.toEqual({
        available: false,
      });
      expect(readRights).toHaveBeenCalledTimes(2);
      expect(readRights).toHaveBeenNthCalledWith(1, worksheetLesson);
      expect(readRights).toHaveBeenNthCalledWith(2, worksheetLesson);
    },
  );

  it("does not offer capabilities when the rights lookup fails", async () => {
    const error = new Error("Curriculum unavailable");
    readRights.mockRejectedValue(error);

    await expect(getCapabilities(worksheetLesson, teacher)).rejects.toBe(error);
    await expect(hasCapabilities(worksheetLesson)).rejects.toBe(error);
  });

  it("reads extracted resource types from the fixture corpus", async () => {
    await expect(resolveEligibility(worksheetLesson)).resolves.toMatchObject({
      rights: unrestricted,
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
      rights: unrestricted,
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
      rights: unrestricted,
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
      rights: unrestricted,
      originalFileResourceTypes: ["worksheet"],
      extractedResourceTypes: [],
    });
    const extractionOnly = evaluateCapabilities([worksheetGatedCapability], {
      lesson: worksheetLesson,
      rights: unrestricted,
      originalFileResourceTypes: [],
      extractedResourceTypes: ["worksheet"],
    });

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

describe("capability rights gate", () => {
  it.each([
    "ogl-compatible",
    "ogl-equivalent",
    "restricted",
    "highly-restricted",
  ] as const)("applies %s to both endpoints", async (maxLevel) => {
    const resolve: EligibilityResolver = async (lesson) => ({
      lesson,
      originalFileResourceTypes: ["worksheet"],
      extractedResourceTypes: ["worksheet"],
      rights: { ...unrestricted, maxRestrictions: [{ category: "works", maxLevel }] },
    });
    const allowed = maxLevel === "ogl-compatible" || maxLevel === "ogl-equivalent";
    expect(
      (await getCapabilities(worksheetLesson, teacher, resolve)).capabilities.length >
        0,
    ).toBe(allowed);
    await expect(hasCapabilities(worksheetLesson, resolve)).resolves.toEqual({
      available: allowed,
    });
  });
});

describe("capability copyright gate", () => {
  const adaptable = (rights: LessonRights | null) =>
    resolverFor(["worksheet"], ["worksheet"], rights);

  it.each([
    ["copyright-restricted", { ...unrestricted, copyrightRestricted: true }],
    ["legacy copyright", { ...unrestricted, legacyCopyright: true }],
    ["expired", { ...unrestricted, expired: true }],
  ])("skips the teacher lookup for a geo-restricted, %s lesson", async (_, rights) => {
    const access = {
      resolve: vi.fn().mockRejectedValue(new Error("Clerk unavailable")),
    };

    await expect(
      getCapabilities(
        worksheetLesson,
        teacher,
        adaptable({ ...rights, geoRestricted: true }),
        access,
      ),
    ).resolves.toEqual({ capabilities: [] });
    expect(access.resolve).not.toHaveBeenCalled();
  });

  it("skips the teacher lookup when a geo-restricted lesson has no extraction", async () => {
    const access = {
      resolve: vi.fn().mockRejectedValue(new Error("Clerk unavailable")),
    };

    await expect(
      getCapabilities(
        worksheetLesson,
        teacher,
        resolverFor(["worksheet"], [], { ...unrestricted, geoRestricted: true }),
        access,
      ),
    ).resolves.toEqual({ capabilities: [] });
    expect(access.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ["a copyright-restricted lesson", { ...unrestricted, copyrightRestricted: true }],
    ["a legacy copyright lesson", { ...unrestricted, legacyCopyright: true }],
    ["an expired lesson", { ...unrestricted, expired: true }],
    ["a lesson Oak does not publish in the programme", null],
  ])("offers nothing for %s, signed in or out", async (_, rights) => {
    await expect(
      getCapabilities(worksheetLesson, teacher, adaptable(rights)),
    ).resolves.toEqual({ capabilities: [] });
    await expect(hasCapabilities(worksheetLesson, adaptable(rights))).resolves.toEqual({
      available: false,
    });
  });

  describe("for a geo-restricted lesson", () => {
    const geoRestricted = adaptable({ ...unrestricted, geoRestricted: true });

    it("offers the capability to a teacher in a copyright region", async () => {
      const access = accessResolving({ tier: "full", inCopyrightRegion: true });

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
        { tier: "limited", inCopyrightRegion: false },
      ],
      [
        "a granted teacher outside the copyright regions",
        { tier: "full", inCopyrightRegion: false },
      ],
    ])("offers nothing to %s", async (_, access) => {
      await expect(
        getCapabilities(
          worksheetLesson,
          teacher,
          geoRestricted,
          accessResolving(access),
        ),
      ).resolves.toEqual({ capabilities: [] });
    });

    it("reports availability when signed out", async () => {
      await expect(hasCapabilities(worksheetLesson, geoRestricted)).resolves.toEqual({
        available: true,
      });
    });
  });

  it("does not look up the teacher for a lesson without the geo flag", async () => {
    const access = accessResolving({ tier: "limited", inCopyrightRegion: false });

    await getCapabilities(worksheetLesson, teacher, adaptable(unrestricted), access);

    expect(access.resolve).not.toHaveBeenCalled();
  });
});
