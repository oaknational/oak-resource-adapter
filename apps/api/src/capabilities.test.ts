import { describe, expect, it, vi } from "vitest";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import { buildCapabilitiesService, smokeTestLabelSuffix } from "./capabilities";
import { createInMemoryFeatureFlags } from "./feature-flags/in-memory";

const teacher: ResourceAdapterAuthenticatedTeacher = {
  teacherId: "teacher_123",
  organisationId: "org_456",
};

const lessonWithWorksheet: LessonContext = {
  lessonSlug: "photosynthesis",
  programmeSlug: "biology-secondary-year-10",
  title: "Photosynthesis",
  subjectSlug: "biology",
  keyStageSlug: "ks4",
  availableResources: ["worksheet"],
};

const lessonWithoutWorksheet: LessonContext = {
  ...lessonWithWorksheet,
  availableResources: [],
};

describe("buildCapabilitiesService", () => {
  it("offers an unauthenticated visitor nothing, without evaluating a flag", async () => {
    const isEnabled = vi.fn();
    const service = buildCapabilitiesService({ isEnabled }, null);

    expect(await service.getCapabilities(lessonWithWorksheet)).toEqual({
      capabilities: [],
    });
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it("returns the unmodified capability when the smoke-test flag is off", async () => {
    const featureFlags = createInMemoryFeatureFlags({
      "capabilities-smoke-test": false,
    });
    const service = buildCapabilitiesService(featureFlags, teacher);

    await expect(service.getCapabilities(lessonWithWorksheet)).resolves.toEqual({
      capabilities: [
        { id: "worksheetAdapter", label: "Adapt worksheet", resourceType: "worksheet" },
      ],
    });
  });

  it("marks only the capability label when the smoke-test flag is on", async () => {
    const featureFlags = createInMemoryFeatureFlags({
      "capabilities-smoke-test": true,
    });
    const service = buildCapabilitiesService(featureFlags, teacher);

    await expect(service.getCapabilities(lessonWithWorksheet)).resolves.toEqual({
      capabilities: [
        {
          id: "worksheetAdapter",
          label: `Adapt worksheet${smokeTestLabelSuffix}`,
          resourceType: "worksheet",
        },
      ],
    });
  });

  it("evaluates the smoke-test flag against the authenticated teacher", async () => {
    const isEnabled = vi.fn().mockResolvedValue(false);
    const service = buildCapabilitiesService({ isEnabled }, teacher);

    await service.getCapabilities(lessonWithWorksheet);

    expect(isEnabled).toHaveBeenCalledWith("capabilities-smoke-test", teacher);
  });

  it("does not evaluate a flag when the lesson offers no capabilities", async () => {
    const isEnabled = vi.fn();
    const service = buildCapabilitiesService({ isEnabled }, teacher);

    await expect(service.getCapabilities(lessonWithoutWorksheet)).resolves.toEqual({
      capabilities: [],
    });
    expect(isEnabled).not.toHaveBeenCalled();
  });
});
