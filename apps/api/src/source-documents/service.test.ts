import { describe, expect, it, vi } from "vitest";

import type { ResourceAdapterSourceDocumentRequest } from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import type { ResourceDocument } from "@oaknational/resource-document";

import { getSourceDocument } from "./service";

const request: ResourceAdapterSourceDocumentRequest = {
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

const document = {
  id: "source-document",
} as ResourceDocument;

describe("getSourceDocument", () => {
  it("retrieves the resource type owned by an eligible capability", async () => {
    const get = vi.fn().mockResolvedValue(document);

    await expect(
      getSourceDocument(
        request,
        teacher,
        async (lesson) => ({
          lesson,
          originalFileResourceTypes: ["worksheet"],
          extractedResourceTypes: ["worksheet"],
        }),
        { get },
      ),
    ).resolves.toBe(document);

    expect(get).toHaveBeenCalledWith({
      source: "oak",
      lessonSlug: request.lesson.lessonSlug,
      programmeSlug: request.lesson.programmeSlug,
      resourceType: "worksheet",
    });
  });

  it("does not retrieve a document for an ineligible lesson", async () => {
    const get = vi.fn();

    await expect(
      getSourceDocument(
        request,
        teacher,
        async (lesson) => ({
          lesson,
          originalFileResourceTypes: ["worksheet"],
          extractedResourceTypes: [],
        }),
        { get },
      ),
    ).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("does not retrieve a document for an unknown capability", async () => {
    const get = vi.fn();
    const resolveContext = vi.fn();

    await expect(
      getSourceDocument(
        { ...request, capabilityId: "futureCapability" },
        teacher,
        resolveContext,
        { get },
      ),
    ).resolves.toBeNull();
    expect(resolveContext).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});
