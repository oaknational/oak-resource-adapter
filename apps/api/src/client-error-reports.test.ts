import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";

import { reportClientError } from "./client-error-reports";

// Mock only the external boundary (Sentry), as in sentry/init.test.ts.
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const report = {
  errorName: "TypeError",
  errorMessage: "Cannot read properties of undefined (reading 'label')",
  componentStack: "at CapabilityList\nat ResourceAdapterDialogInner",
};

describe("reportClientError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("forwards a synthetic error to Sentry tagged as a client/UI error", () => {
    reportClientError(report);

    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: report.errorMessage,
        name: report.errorName,
      }),
      {
        fingerprint: [
          "resource-adapter-client-error",
          report.errorName,
          report.errorMessage,
        ],
        level: "error",
        tags: { source: "client-ui" },
        extra: { componentStack: report.componentStack },
      },
    );
  });

  it("never attaches the raw client value as a cause", () => {
    reportClientError(report);

    const [captured] = vi.mocked(Sentry.captureException).mock.calls[0] ?? [];
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).cause).toBeUndefined();
  });

  it("falls back to the error name when the message is empty", () => {
    reportClientError({ ...report, errorMessage: "" });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: report.errorName }),
      expect.anything(),
    );
  });

  it("reports a null componentStack when the report omits it", () => {
    reportClientError({
      errorName: report.errorName,
      errorMessage: report.errorMessage,
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extra: { componentStack: null } }),
    );
  });

  it("swallows a throwing Sentry client after logging it", () => {
    vi.mocked(Sentry.captureException).mockImplementation(() => {
      throw new Error("Sentry unreachable");
    });

    expect(() => reportClientError(report)).not.toThrow();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "Sentry unreachable" }),
    );
  });
});
