import { describe, expect, it, vi } from "vitest";

import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

import type { EligibilityContextReader } from "./service";
import { admitToCapability } from "./admission";

vi.mock("../teacher-access/resolver", () => ({
  teacherAccessResolver: {
    resolve: () =>
      Promise.resolve({ onboarded: true, tier: "full", inCopyrightRegion: true }),
  },
}));

const request: Parameters<typeof admitToCapability>[0] = {
  capabilityId: "worksheetScaffolding",
  lesson: {
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    title: "Adopting different perspectives",
    subjectSlug: "english",
    keyStageSlug: "ks2",
    availableResources: ["worksheet"],
  },
};

const teacher: ResourceAdapterAuthenticatedTeacher = {
  organisationId: "org-123",
  teacherId: "teacher-456",
};

const admitted = {
  outcome: "admitted",
  locator: {
    source: "oak",
    lessonSlug: request.lesson.lessonSlug,
    programmeSlug: request.lesson.programmeSlug,
    resourceType: "worksheet",
  },
};

const unavailable = { outcome: "unavailable" };

const unrestricted: LessonEligibilityFacts = {
  restrictionLevels: { works: [], media: [], downloadableFiles: [], featureKeys: [] },
  subjectSlugs: ["english"],
  subjectCategories: [],
  legacy: false,
  contentGuidance: [],
};

const adaptableWith =
  (facts: LessonEligibilityFacts): EligibilityContextReader =>
  async (lesson) => ({
    lesson,
    facts,
    originalFileResourceTypes: ["worksheet"],
    extractedResourceTypes: ["worksheet"],
  });

describe("admitToCapability", () => {
  it("admits a teacher to an eligible capability, with its resource type", async () => {
    await expect(
      admitToCapability(request, teacher, adaptableWith(unrestricted)),
    ).resolves.toEqual(admitted);
  });

  it("asks a teacher who is not onboarded to finish setting up, without reading the lesson", async () => {
    const readContext = vi.fn<EligibilityContextReader>();

    await expect(
      admitToCapability(request, teacher, readContext, {
        resolve: vi.fn().mockResolvedValue({
          onboarded: false,
          tier: "full",
          inCopyrightRegion: true,
        }),
      }),
    ).resolves.toEqual({ outcome: "needsSetup" });
    expect(readContext).not.toHaveBeenCalled();
  });

  it("does not admit a teacher to an ineligible lesson", async () => {
    await expect(
      admitToCapability(request, teacher, async (lesson) => ({
        lesson,
        facts: unrestricted,
        originalFileResourceTypes: ["worksheet"],
        extractedResourceTypes: [],
      })),
    ).resolves.toEqual(unavailable);
  });

  it.each(["futureCapability", "toString", "constructor", "__proto__"])(
    "does not admit a teacher to the unknown capability %s",
    async (capabilityId) => {
      const readContext = vi.fn();

      await expect(
        admitToCapability({ ...request, capabilityId }, teacher, readContext),
      ).resolves.toEqual(unavailable);
      expect(readContext).not.toHaveBeenCalled();
    },
  );
});

it.each(["restricted", "highly-restricted"] as const)(
  "does not admit a teacher to %s source material",
  async (maxLevel) => {
    await expect(
      admitToCapability(
        request,
        teacher,
        adaptableWith({
          ...unrestricted,
          restrictionLevels: {
            works: [],
            media: [maxLevel],
            downloadableFiles: [],
            featureKeys: [],
          },
        }),
      ),
    ).resolves.toEqual(unavailable);
  },
);

it("does not admit a teacher to a lesson in an excluded subject", async () => {
  await expect(
    admitToCapability(
      request,
      teacher,
      adaptableWith({ ...unrestricted, subjectSlugs: ["geography"] }),
    ),
  ).resolves.toEqual(unavailable);
});

it.each([
  ["admits", true, admitted],
  ["does not admit", false, unavailable],
])(
  "%s a teacher to geo-restricted source material when inCopyrightRegion is %s",
  async (_, inCopyrightRegion, expected) => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ onboarded: true, tier: "full", inCopyrightRegion });
    await expect(
      admitToCapability(
        request,
        teacher,
        adaptableWith({
          ...unrestricted,
          restrictionLevels: {
            works: [],
            media: [],
            downloadableFiles: [],
            featureKeys: ["agf__geo_restricted"],
          },
        }),
        { resolve },
      ),
    ).resolves.toEqual(expected);
    expect(resolve).toHaveBeenCalledWith(teacher.teacherId);
  },
);
