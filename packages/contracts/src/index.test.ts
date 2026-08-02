import { describe, expect, it, vi } from "vitest";

import {
  clientErrorReportSchema,
  lessonContextSchema,
  parseResourceAdapterApiContractVersion,
  resourceAdapterApiContractVersion,
  resourceAdapterCapabilitiesResponseSchema,
} from "./index.js";
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
      clientErrorReports: { report: vi.fn() },
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

  it("rejects an unsupported API contract version", async () => {
    const caller = appRouterV1.createCaller({
      apiContractVersion: 999,
      authenticatedTeacher: null,
      capabilities: {
        getCapabilities: () => ({ capabilities: [] }),
      },
      clientErrorReports: { report: vi.fn() },
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
      clientErrorReports: { report: vi.fn() },
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

describe("client error reporting", () => {
  const validReport = {
    errorName: "TypeError",
    errorMessage: "Cannot read properties of undefined (reading 'label')",
    componentStack: "at CapabilityList\nat ResourceAdapterDialogInner",
  };

  function createCallerWith(
    report: (input: unknown) => Promise<void> | void,
    authenticatedTeacher: {
      organisationId: string | null;
      teacherId: string;
    } | null = {
      organisationId: "org-123",
      teacherId: "teacher-456",
    },
  ) {
    return appRouterV1.createCaller({
      apiContractVersion: resourceAdapterApiContractVersion,
      authenticatedTeacher,
      capabilities: {
        getCapabilities: () => ({ capabilities: [] }),
      },
      clientErrorReports: { report },
    });
  }

  it("trims report fields when parsing", () => {
    expect(
      clientErrorReportSchema.parse({
        errorName: "  TypeError  ",
        errorMessage: "  boom  ",
      }),
    ).toMatchObject({ errorName: "TypeError", errorMessage: "boom" });
  });

  it("delegates a valid report to the service and returns a receipt", async () => {
    const report = vi.fn();

    await expect(
      createCallerWith(report).clientErrors.report(validReport),
    ).resolves.toEqual({ received: true });
    expect(report).toHaveBeenCalledExactlyOnceWith(validReport);
  });

  it("rejects an unauthenticated report with UNAUTHORIZED", async () => {
    const report = vi.fn();

    await expect(
      createCallerWith(report, null).clientErrors.report(validReport),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown field", { ...validReport, lessonContent: "sensitive" }],
    ["a missing errorName", { errorMessage: "boom" }],
    ["an empty errorName", { ...validReport, errorName: "   " }],
    ["an oversize errorName", { ...validReport, errorName: "E".repeat(101) }],
    ["an oversize errorMessage", { ...validReport, errorMessage: "m".repeat(501) }],
    [
      "an oversize componentStack",
      { ...validReport, componentStack: "s".repeat(4001) },
    ],
    ["a non-string errorName", { ...validReport, errorName: 42 }],
  ])("rejects a report with %s as BAD_REQUEST", async (_label, input) => {
    const report = vi.fn();

    await expect(
      createCallerWith(report).clientErrors.report(
        input as Parameters<
          ReturnType<typeof createCallerWith>["clientErrors"]["report"]
        >[0],
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(report).not.toHaveBeenCalled();
  });
});
