import type { NextRequest } from "next/server";
import { afterEach, describe, beforeEach, expect, it, vi } from "vitest";
import {
  resourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";
import { setErrorReporter } from "@oaknational/resource-adapter-logger";

import { GET as getHealth } from "../app/health/route";
import {
  GET as getCapabilities,
  OPTIONS as options,
  POST as postClientError,
} from "../app/trpc/v1/[trpc]/route";
import { GET as getJobStatus } from "../app/dev/jobs/[id]/route";
import {
  OPTIONS as testJobOptions,
  POST as postTestJob,
} from "../app/dev/jobs/test-echo/route";
import * as Sentry from "@sentry/nextjs";
import * as capabilities from "./capabilities";
import { requestAuthenticator } from "./authentication";

// Passthrough mock: keeps the real capabilities service for every test, but
// makes its exports spy-able so a single test can force the resolver to throw.
vi.mock("./capabilities", async (importOriginal) =>
  importOriginal<typeof import("./capabilities")>(),
);

// Mock only the external boundary (Sentry) so the real client-error-reports
// service runs against a spy, as in sentry/init.test.ts.
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("./authentication", async (importOriginal) => {
  const original = await importOriginal<typeof import("./authentication")>();
  return {
    ...original,
    requestAuthenticator: vi.fn(original.requestAuthenticator),
  };
});

const lesson = {
  lessonSlug: "adding-fractions",
  programmeSlug: "ks2-maths",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
};

function request(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as NextRequest;
}

function capabilitiesRequest(
  input: unknown,
  apiContractVersion: number | null = resourceAdapterApiContractVersion,
): NextRequest {
  return request("http://localhost:3001/trpc/v1/capabilities.get?batch=1", {
    body: JSON.stringify({ "0": input }),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...(apiContractVersion === null
        ? {}
        : {
            [resourceAdapterApiContractVersionHeader]: String(apiContractVersion),
          }),
    },
    method: "POST",
  });
}

function clientErrorRequest(input: unknown): NextRequest {
  return request("http://localhost:3001/trpc/v1/clientErrors.report?batch=1", {
    body: JSON.stringify({ "0": input }),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      [resourceAdapterApiContractVersionHeader]: String(
        resourceAdapterApiContractVersion,
      ),
    },
    method: "POST",
  });
}

describe("API routes", () => {
  beforeEach(() => {
    // The /dev routes are opt-in; the tests asserting they are closed unset this.
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");

    vi.mocked(requestAuthenticator).mockImplementation(async () => {
      return {
        organisationId: "org-123",
        teacherId: "teacher-456",
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns CORS-enabled health status", async () => {
    const response = getHealth(
      request("http://localhost:3001/health", {
        headers: { Origin: "http://localhost:3000" },
      }),
    );

    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("returns the initial capability for valid lesson context", async () => {
    const response = await getCapabilities(capabilitiesRequest(lesson));

    await expect(response.json()).resolves.toMatchObject([
      { result: { data: { capabilities: [{ id: "worksheetAdapter" }] } } },
    ]);
  });

  it("does not offer the worksheet adapter when a worksheet is unavailable", async () => {
    const response = await getCapabilities(
      capabilitiesRequest({ ...lesson, availableResources: ["starter-quiz"] }),
    );

    await expect(response.json()).resolves.toMatchObject([
      { result: { data: { capabilities: [] } } },
    ]);
  });

  it("rejects an unsupported API contract version", async () => {
    const response = await getCapabilities(capabilitiesRequest(lesson, 999));

    expect(response.status).toBe(412);
    await expect(response.json()).resolves.toMatchObject([
      { error: { data: { code: "PRECONDITION_FAILED" } } },
    ]);
  });

  it("reports an unexpected server error to the error reporter", async () => {
    const report = vi.fn();
    setErrorReporter(report);
    vi.spyOn(capabilities, "getCapabilities").mockImplementation(() => {
      throw new Error("capabilities service unavailable");
    });

    const response = await getCapabilities(capabilitiesRequest(lesson));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject([
      { error: { data: { code: "INTERNAL_SERVER_ERROR" } } },
    ]);
    expect(report).toHaveBeenCalledOnce();
  });

  it("does not report a client input error to the error reporter", async () => {
    const report = vi.fn();
    setErrorReporter(report);

    const response = await getCapabilities(
      capabilitiesRequest({ ...lesson, availableResources: ["essay"] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject([
      { error: { data: { code: "BAD_REQUEST" } } },
    ]);
    expect(report).not.toHaveBeenCalled();
  });

  it("returns CORS headers for tRPC preflight requests", () => {
    const response = options(
      request("http://localhost:3001/trpc/v1/capabilities.get", {
        headers: { Origin: "http://localhost:3000" },
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "X-Resource-Adapter-Contract-Version",
    );
  });

  it("returns CORS headers for test job preflight requests", () => {
    const response = testJobOptions(
      request("http://localhost:3001/dev/jobs/test-echo", {
        headers: { Origin: "http://localhost:3000" },
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  // These also prove the gate precedes any database access: with no DATABASE_URL
  // set, a gate after the query would throw instead of returning 404.
  it("hides the test job route unless dev routes are enabled", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "");

    const preflight = testJobOptions(
      request("http://localhost:3001/dev/jobs/test-echo", {
        headers: { Origin: "http://localhost:3000" },
        method: "OPTIONS",
      }),
    );
    expect(preflight.status).toBe(404);

    const created = await postTestJob(
      request("http://localhost:3001/dev/jobs/test-echo", {
        body: JSON.stringify({ message: "hello worker" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    expect(created.status).toBe(404);
  });

  it("hides the job status route unless dev routes are enabled", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "");

    const response = await getJobStatus(
      request("http://localhost:3001/dev/jobs/01JBQ2X5N0000000000000000"),
      { params: Promise.resolve({ id: "01JBQ2X5N0000000000000000" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 Unauthorized when the request is not authenticated", async () => {
    vi.mocked(requestAuthenticator).mockImplementation(async () => {
      return null;
    });

    const response = await getCapabilities(capabilitiesRequest(lesson));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject([
      { error: { data: { code: "UNAUTHORIZED" } } },
    ]);
  });

  describe("client error reporting", () => {
    const clientErrorReport = {
      errorName: "TypeError",
      errorMessage: "Cannot read properties of undefined (reading 'label')",
      componentStack: "at CapabilityList",
    };

    beforeEach(() => {
      // Factory mocks (Sentry.captureException) keep call history across
      // tests; restoreAllMocks does not touch them.
      vi.mocked(Sentry.captureException).mockClear();
    });

    it("accepts a valid report and forwards it to Sentry tagged client-ui", async () => {
      const response = await postClientError(clientErrorRequest(clientErrorReport));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject([
        { result: { data: { received: true } } },
      ]);
      expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "TypeError" }),
        expect.objectContaining({ tags: { source: "client-ui" } }),
      );
    });

    it("rejects a malformed report without reporting anything", async () => {
      const report = vi.fn();
      setErrorReporter(report);

      const response = await postClientError(
        clientErrorRequest({ ...clientErrorReport, lessonContent: "sensitive" }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject([
        { error: { data: { code: "BAD_REQUEST" } } },
      ]);
      expect(report).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("rejects an unauthenticated report with 401", async () => {
      vi.mocked(requestAuthenticator).mockImplementation(async () => null);

      const response = await postClientError(clientErrorRequest(clientErrorReport));

      expect(response.status).toBe(401);
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("still returns a receipt when Sentry itself fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(Sentry.captureException).mockImplementation(() => {
        throw new Error("Sentry unreachable");
      });

      const response = await postClientError(clientErrorRequest(clientErrorReport));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject([
        { result: { data: { received: true } } },
      ]);
    });
  });
});
