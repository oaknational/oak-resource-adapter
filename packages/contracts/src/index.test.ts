import { describe, expect, it } from "vitest";

import {
  lessonContextSchema,
  parseResourceAdapterApiContractVersion,
  resourceAdapterApiContractVersion,
  resourceAdapterCapabilitiesResponseSchema,
} from "./index.js";
import { resourceAdapterFeatureFlagsResponseSchema } from "./internal.js";
import { appRouterV1 } from "./server.js";

describe("Resource Adapter API contracts", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    [null, null],
    ["", null],
    ["01", null],
    ["1.0", null],
    ["1beta", null],
    [" 1", null],
    ["9007199254740992", null],
  ])("parses API contract version header %j as %j", (value, expected) => {
    expect(parseResourceAdapterApiContractVersion(value)).toBe(expected);
  });

  it("accepts a representative lesson context", () => {
    expect(
      lessonContextSchema.parse({
        lessonSlug: "adding-fractions",
        programmeSlug: "ks2-maths",
        title: "Adding fractions",
        subjectSlug: "maths",
        keyStageSlug: "ks2",
        availableResources: ["worksheet"],
      }),
    ).toMatchObject({ title: "Adding fractions" });
  });

  it("accepts a capability response", () => {
    expect(
      resourceAdapterCapabilitiesResponseSchema.parse({
        capabilities: [
          {
            id: "worksheetAdapter",
            label: "Adapt worksheet",
            resourceType: "worksheet",
          },
        ],
      }),
    ).toMatchObject({
      capabilities: [{ id: "worksheetAdapter" }],
    });
  });

  it("accepts a capability introduced after this package version", () => {
    expect(
      resourceAdapterCapabilitiesResponseSchema.parse({
        capabilities: [
          {
            id: "future-adapter",
            label: "A future adapter",
            resourceType: "worksheet",
          },
        ],
      }),
    ).toMatchObject({ capabilities: [{ id: "future-adapter" }] });
  });

  it("calls the capabilities service through the typed router", async () => {
    const caller = appRouterV1.createCaller({
      apiContractVersion: resourceAdapterApiContractVersion,
      authenticatedTeacher: {
        organisationId: "org-123",
        teacherId: "teacher-456",
      },
      capabilities: {
        getCapabilities: () => ({
          capabilities: [
            {
              id: "worksheetAdapter",
              label: "Adapt worksheet",
              resourceType: "worksheet",
            },
          ],
        }),
      },
      featureFlags: {
        getEnabledFlags: () => [],
      },
    });

    await expect(
      caller.capabilities.get({
        lessonSlug: "adding-fractions",
        programmeSlug: "ks2-maths",
        title: "Adding fractions",
        subjectSlug: "maths",
        keyStageSlug: "ks2",
        availableResources: ["worksheet"],
      }),
    ).resolves.toMatchObject({ capabilities: [{ id: "worksheetAdapter" }] });
  });

  it("calls the feature flags service through the typed router", async () => {
    const caller = appRouterV1.createCaller({
      apiContractVersion: resourceAdapterApiContractVersion,
      authenticatedTeacher: {
        organisationId: "org-123",
        teacherId: "teacher-456",
      },
      capabilities: {
        getCapabilities: () => ({ capabilities: [] }),
      },
      featureFlags: {
        getEnabledFlags: () => ["feature-flags-smoke-test-enabled"],
      },
    });

    await expect(caller.featureFlags.get()).resolves.toEqual([
      "feature-flags-smoke-test-enabled",
    ]);
  });

  it("rejects an unsupported API contract version", async () => {
    const caller = appRouterV1.createCaller({
      apiContractVersion: 999,
      authenticatedTeacher: null,
      capabilities: {
        getCapabilities: () => ({ capabilities: [] }),
      },
      featureFlags: {
        getEnabledFlags: () => [],
      },
    });

    await expect(
      caller.capabilities.get({
        lessonSlug: "adding-fractions",
        programmeSlug: "ks2-maths",
        title: "Adding fractions",
        subjectSlug: "maths",
        keyStageSlug: "ks2",
        availableResources: ["worksheet"],
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects an unauthenticated request with UNAUTHORIZED", async () => {
    const caller = appRouterV1.createCaller({
      apiContractVersion: resourceAdapterApiContractVersion,
      authenticatedTeacher: null,
      capabilities: {
        getCapabilities: () => ({ capabilities: [] }),
      },
      featureFlags: {
        getEnabledFlags: () => [],
      },
    });

    await expect(
      caller.capabilities.get({
        lessonSlug: "adding-fractions",
        programmeSlug: "ks2-maths",
        title: "Adding fractions",
        subjectSlug: "maths",
        keyStageSlug: "ks2",
        availableResources: ["worksheet"],
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
