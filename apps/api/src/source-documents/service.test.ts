import { describe, expect, it, vi } from "vitest";

import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import type { LessonRights } from "@oaknational/resource-adapter-curriculum";

import type { EligibilityResolver } from "../capabilities/service";
import { resolveSourceDocumentLocator } from "./service";

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

const locator = {
  source: "oak",
  lessonSlug: request.lesson.lessonSlug,
  programmeSlug: request.lesson.programmeSlug,
  resourceType: "worksheet",
};

const unrestricted: LessonRights = {
  maxRestrictions: [],
  copyrightRestricted: false,
  legacyCopyright: false,
  expired: false,
  geoRestricted: false,
};

const adaptableWith =
  (rights: LessonRights): EligibilityResolver =>
  async (lesson) => ({
    lesson,
    rights,
    originalFileResourceTypes: ["worksheet"],
    extractedResourceTypes: ["worksheet"],
  });

describe("resolveSourceDocumentLocator", () => {
  it("locates the resource type owned by an eligible capability", async () => {
    await expect(
      resolveSourceDocumentLocator(request, teacher, adaptableWith(unrestricted)),
    ).resolves.toEqual(locator);
  });

  it("does not resolve a locator for an ineligible lesson", async () => {
    await expect(
      resolveSourceDocumentLocator(request, teacher, async (lesson) => ({
        lesson,
        rights: unrestricted,
        originalFileResourceTypes: ["worksheet"],
        extractedResourceTypes: [],
      })),
    ).resolves.toBeNull();
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
      ).resolves.toBeNull();
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
          maxRestrictions: [{ category: "media", maxLevel }],
        }),
      ),
    ).resolves.toBeNull();
  },
);

it("does not locate copyright-restricted source material", async () => {
  await expect(
    resolveSourceDocumentLocator(
      request,
      teacher,
      adaptableWith({ ...unrestricted, copyrightRestricted: true }),
    ),
  ).resolves.toBeNull();
});

it.each([
  ["locates", true, locator],
  ["does not locate", false, null],
])(
  "%s geo-restricted source material when inCopyrightRegion is %s",
  async (_, inCopyrightRegion, expected) => {
    const resolve = vi.fn().mockResolvedValue({ tier: "full", inCopyrightRegion });
    await expect(
      resolveSourceDocumentLocator(
        request,
        teacher,
        adaptableWith({ ...unrestricted, geoRestricted: true }),
        { resolve },
      ),
    ).resolves.toEqual(expected);
    expect(resolve).toHaveBeenCalledWith(teacher.teacherId);
  },
);
