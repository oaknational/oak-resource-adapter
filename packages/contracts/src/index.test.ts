import { describe, expect, it, vi } from "vitest";
import type { ResourceDocument } from "@oaknational/resource-document";

import {
  lessonContextSchema,
  parseResourceAdapterApiContractVersion,
  resourceAdapterApiContractVersion,
  resourceAdapterCapabilitiesResponseSchema,
} from "./index.js";
import { internalRouter } from "./internal-server.js";
import { hostRouter } from "./server.js";

const sourceDocument: ResourceDocument = {
  schemaVersion: "0.1",
  id: "oak:worksheet:adding-fractions:pupil",
  profile: "worksheet.v0",
  language: "en-GB",
  metadata: { title: "Adding fractions" },
  content: [],
  answers: [],
  assets: [],
  provenance: {
    source: { system: "oak", id: "adding-fractions" },
    producer: { name: "test", version: "1" },
  },
  diagnostics: [],
};

const worksheetScaffolding = {
  applySuggestion: () => Promise.resolve(null),
  get: () => Promise.resolve(null),
  open: () => Promise.resolve(null),
};
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
            id: "worksheetScaffolding",
            label: "Adapt worksheet",
            resourceType: "worksheet",
          },
        ],
      }),
    ).toMatchObject({
      capabilities: [{ id: "worksheetScaffolding" }],
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

  describe("Public API (hostRouter)", () => {
    it("calls the capabilities service through the typed router", async () => {
      const caller = hostRouter.createCaller({
        apiContractVersion: resourceAdapterApiContractVersion,
        authenticatedTeacher: {
          organisationId: "org-123",
          teacherId: "teacher-456",
        },
        capabilities: {
          getCapabilities: () => ({
            capabilities: [
              {
                id: "worksheetScaffolding",
                label: "Adapt worksheet",
                resourceType: "worksheet",
              },
            ],
          }),
          hasCapabilities: () => ({ available: true }),
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
      ).resolves.toMatchObject({ capabilities: [{ id: "worksheetScaffolding" }] });
    });

    it("rejects an unsupported API contract version", async () => {
      const caller = hostRouter.createCaller({
        apiContractVersion: 999,
        authenticatedTeacher: {
          organisationId: "org-123",
          teacherId: "teacher-456",
        },
        capabilities: {
          getCapabilities: () => ({ capabilities: [] }),
          hasCapabilities: () => ({ available: false }),
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

    it("answers capability availability without authentication", async () => {
      const caller = hostRouter.createCaller({
        apiContractVersion: resourceAdapterApiContractVersion,
        authenticatedTeacher: null,
        capabilities: {
          getCapabilities: () => ({ capabilities: [] }),
          hasCapabilities: () => ({ available: true }),
        },
      });

      await expect(
        caller.capabilities.available({
          lessonSlug: "adding-fractions",
          programmeSlug: "ks2-maths",
          title: "Adding fractions",
          subjectSlug: "maths",
          keyStageSlug: "ks2",
          availableResources: ["worksheet"],
          supportedCapabilityIds: ["worksheetScaffolding"],
        }),
      ).resolves.toEqual({ available: true });
    });

    it("still version-guards capability availability", async () => {
      const caller = hostRouter.createCaller({
        apiContractVersion: 999,
        authenticatedTeacher: null,
        capabilities: {
          getCapabilities: () => ({ capabilities: [] }),
          hasCapabilities: () => ({ available: true }),
        },
      });

      await expect(
        caller.capabilities.available({
          lessonSlug: "adding-fractions",
          programmeSlug: "ks2-maths",
          title: "Adding fractions",
          subjectSlug: "maths",
          keyStageSlug: "ks2",
          availableResources: ["worksheet"],
        }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("rejects a service document that does not match the schema", async () => {
      const caller = internalRouter.createCaller({
        authenticatedTeacher: {
          organisationId: "org-123",
          teacherId: "teacher-456",
        },
        featureFlags: { getEnabledFlags: () => [] },
        sourceDocuments: {
          getSourceDocument: () =>
            ({ id: "not-a-document" }) as unknown as ResourceDocument,
        },
        worksheetScaffolding,
      });

      await expect(
        caller.sourceDocuments.get({
          capabilityId: "worksheetScaffolding",
          lesson: {
            lessonSlug: "adding-fractions",
            programmeSlug: "ks2-maths",
            title: "Adding fractions",
            subjectSlug: "maths",
            keyStageSlug: "ks2",
            availableResources: ["worksheet"],
          },
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("rejects an unauthenticated request with UNAUTHORIZED", async () => {
      const caller = hostRouter.createCaller({
        apiContractVersion: resourceAdapterApiContractVersion,
        authenticatedTeacher: null,
        capabilities: {
          getCapabilities: () => ({ capabilities: [] }),
          hasCapabilities: () => ({ available: false }),
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

  describe("Internal API (internalRouter)", () => {
    it("calls the feature flags service through the typed router", async () => {
      const caller = internalRouter.createCaller({
        authenticatedTeacher: {
          organisationId: "org-123",
          teacherId: "teacher-456",
        },
        featureFlags: {
          getEnabledFlags: () => ["feature-flags-smoke-test-enabled"],
        },
        sourceDocuments: {
          getSourceDocument: () => sourceDocument,
        },
        worksheetScaffolding,
      });

      await expect(caller.featureFlags.get()).resolves.toEqual([
        "feature-flags-smoke-test-enabled",
      ]);
    });

    it("returns a source document for an eligible capability", async () => {
      const getSourceDocument = vi.fn(() => sourceDocument);
      const caller = internalRouter.createCaller({
        authenticatedTeacher: {
          organisationId: "org-123",
          teacherId: "teacher-456",
        },
        featureFlags: { getEnabledFlags: () => [] },
        sourceDocuments: { getSourceDocument },
        worksheetScaffolding,
      });

      await expect(
        caller.sourceDocuments.get({
          capabilityId: "worksheetScaffolding",
          lesson: {
            lessonSlug: "adding-fractions",
            programmeSlug: "ks2-maths",
            title: "Adding fractions",
            subjectSlug: "maths",
            keyStageSlug: "ks2",
            availableResources: ["worksheet"],
          },
        }),
      ).resolves.toEqual(sourceDocument);
      expect(getSourceDocument).toHaveBeenCalledWith(
        expect.objectContaining({ capabilityId: "worksheetScaffolding" }),
        { organisationId: "org-123", teacherId: "teacher-456" },
      );
    });

    it("returns NOT_FOUND when a capability has no source document", async () => {
      const caller = internalRouter.createCaller({
        authenticatedTeacher: {
          organisationId: "org-123",
          teacherId: "teacher-456",
        },
        featureFlags: { getEnabledFlags: () => [] },
        sourceDocuments: { getSourceDocument: () => null },
        worksheetScaffolding,
      });

      await expect(
        caller.sourceDocuments.get({
          capabilityId: "missing",
          lesson: {
            lessonSlug: "adding-fractions",
            programmeSlug: "ks2-maths",
            title: "Adding fractions",
            subjectSlug: "maths",
            keyStageSlug: "ks2",
            availableResources: ["worksheet"],
          },
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects an unauthenticated request with UNAUTHORIZED", async () => {
      const caller = internalRouter.createCaller({
        authenticatedTeacher: null,
        featureFlags: {
          getEnabledFlags: () => [],
        },
        sourceDocuments: {
          getSourceDocument: () => null,
        },
        worksheetScaffolding,
      });

      await expect(caller.featureFlags.get()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  });
});
