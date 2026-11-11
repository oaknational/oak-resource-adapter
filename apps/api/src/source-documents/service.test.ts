import { describe, expect, it, vi } from "vitest";

import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

import type { EligibilityResolver } from "../capabilities/service";
import { resolveSourceDocumentLocator } from "./service";

vi.mock("../teacher-access/resolver", () => ({
  teacherAccessResolver: {
    resolve: () =>
      Promise.resolve({ onboarded: true, tier: "full", inCopyrightRegion: true }),
  },
}));

const request: Parameters<typeof resolveSourceDocumentLocator>[0] = {
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

const located = {
  outcome: "located",
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
  legacy: false,
};

const adaptableWith =
  (facts: LessonEligibilityFacts): EligibilityResolver =>
  async (lesson) => ({
    lesson,
    facts,
    originalFileResourceTypes: ["worksheet"],
    extractedResourceTypes: ["worksheet"],
  });

describe("resolveSourceDocumentLocator", () => {
  it("locates the resource type owned by an eligible capability", async () => {
    await expect(
      resolveSourceDocumentLocator(request, teacher, adaptableWith(unrestricted)),
    ).resolves.toEqual(located);
  });

  it("asks a teacher who is not onboarded to finish setting up, without reading the lesson", async () => {
    const resolveContext = vi.fn<EligibilityResolver>();

    await expect(
      resolveSourceDocumentLocator(request, teacher, resolveContext, {
        resolve: vi.fn().mockResolvedValue({
          onboarded: false,
          tier: "full",
          inCopyrightRegion: true,
        }),
      }),
    ).resolves.toEqual({ outcome: "needsSetup" });
    expect(resolveContext).not.toHaveBeenCalled();
  });

  it("does not resolve a locator for an ineligible lesson", async () => {
    await expect(
      resolveSourceDocumentLocator(request, teacher, async (lesson) => ({
        lesson,
        facts: unrestricted,
        originalFileResourceTypes: ["worksheet"],
        extractedResourceTypes: [],
      })),
    ).resolves.toEqual(unavailable);
  });

  it.each(["futureCapability", "toString", "constructor", "__proto__"])(
    "does not resolve a locator for the unknown capability %s",
    async (capabilityId) => {
      const resolveContext = vi.fn();

      await expect(
        resolveSourceDocumentLocator(
          { ...request, capabilityId },
          teacher,
          resolveContext,
        ),
      ).resolves.toEqual(unavailable);
      expect(resolveContext).not.toHaveBeenCalled();
    },
  );
});

it.each(["restricted", "highly-restricted"] as const)(
  "does not locate %s source material",
  async (maxLevel) => {
    await expect(
      resolveSourceDocumentLocator(
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

it("does not locate source material in an excluded subject", async () => {
  await expect(
    resolveSourceDocumentLocator(
      request,
      teacher,
      adaptableWith({ ...unrestricted, subjectSlugs: ["geography"] }),
    ),
  ).resolves.toEqual(unavailable);
});

it.each([
  ["locates", true, located],
  ["does not locate", false, unavailable],
])(
  "%s geo-restricted source material when inCopyrightRegion is %s",
  async (_, inCopyrightRegion, expected) => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ onboarded: true, tier: "full", inCopyrightRegion });
    await expect(
      resolveSourceDocumentLocator(
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
