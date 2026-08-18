import type { NextRequest } from "next/server";
import { afterEach, describe, beforeEach, expect, it, vi } from "vitest";
import { ModelInvocationError } from "@oaknational/resource-adapter-ai";
import {
  resourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";
import { setErrorReporter } from "@oaknational/resource-adapter-logger";

import { GET as getHealth } from "../app/health/route";
import {
  GET as getCapabilities,
  OPTIONS as options,
} from "../app/trpc/v1/[trpc]/route";
import {
  GET as getFeatureFlags,
  OPTIONS as internalOptions,
} from "../app/trpc/internal/[trpc]/route";
import {
  OPTIONS as modelInvokeOptions,
  POST as postModelInvoke,
} from "../app/dev/ai/invoke/route";
import { GET as getJobStatus } from "../app/dev/jobs/[id]/route";
import {
  OPTIONS as testJobOptions,
  POST as postTestJob,
} from "../app/dev/jobs/test-echo/route";
import { invokeDevSmokeText } from "./ai/dev-invoker";
import * as capabilities from "./capabilities/service";
import { requestAuthenticator } from "./authentication";

// Passthrough mock: keeps the real capabilities service for every test, but
// makes its exports spy-able so a single test can force the resolver to throw.
vi.mock("./capabilities/service", async (importOriginal) =>
  importOriginal<typeof import("./capabilities/service")>(),
);

vi.mock("./authentication", async (importOriginal) => {
  const original = await importOriginal<typeof import("./authentication")>();
  return {
    ...original,
    requestAuthenticator: vi.fn(original.requestAuthenticator),
  };
});

// Fully stubbed so these tests can never make a paid OpenAI call.
vi.mock("./ai/dev-invoker", () => ({
  invokeDevSmokeText: vi.fn(),
}));

// Must stay a lesson the fixture corpus holds a worksheet extraction for.
const lesson = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
  title: "Adopting different perspectives",
  subjectSlug: "english",
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

function modelInvokeRequest(body: unknown): NextRequest {
  return request("http://localhost:3001/dev/ai/invoke", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    method: "POST",
  });
}

function featureFlagsRequest(): NextRequest {
  return request("http://localhost:3001/trpc/internal/featureFlags.get?batch=1", {
    headers: {
      Origin: "http://localhost:3000",
    },
  });
}

describe("API routes", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "1");
    vi.mocked(invokeDevSmokeText).mockReset();

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

  it("returns feature flags from the unversioned internal API", async () => {
    const response = await getFeatureFlags(featureFlagsRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject([{ result: { data: [] } }]);
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

  it("returns CORS headers for internal tRPC preflight requests", () => {
    const response = internalOptions(
      request("http://localhost:3001/trpc/internal/featureFlags.get", {
        headers: { Origin: "http://localhost:3000" },
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
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

  it("returns CORS headers for model invocation preflight requests", () => {
    const response = modelInvokeOptions(
      request("http://localhost:3001/dev/ai/invoke", {
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

  it("hides the model invocation route unless dev routes are enabled", async () => {
    vi.stubEnv("ENABLE_DEV_ROUTES", "");

    const preflight = modelInvokeOptions(
      request("http://localhost:3001/dev/ai/invoke", {
        headers: { Origin: "http://localhost:3000" },
        method: "OPTIONS",
      }),
    );
    expect(preflight.status).toBe(404);

    const response = await postModelInvoke(modelInvokeRequest({ input: "ping" }));
    expect(response.status).toBe(404);
  });

  it("returns 503 when the invoker reports it is not configured", async () => {
    vi.mocked(invokeDevSmokeText).mockRejectedValue(
      new ModelInvocationError({
        code: "INVALID_CONFIGURATION",
        message: "OPENAI_API_KEY is not configured.",
      }),
    );

    const response = await postModelInvoke(modelInvokeRequest({ input: "ping" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_CONFIGURATION",
      error: "OPENAI_API_KEY is not configured.",
    });
  });

  it("rejects a bad request body before calling the model", async () => {
    for (const body of [{}, { input: "" }, { input: "a".repeat(2001) }]) {
      const response = await postModelInvoke(modelInvokeRequest(body));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "The model invocation request is invalid.",
      });
    }
    expect(invokeDevSmokeText).not.toHaveBeenCalled();
  });

  it("returns only the expected fields, never the raw provider response", async () => {
    vi.mocked(invokeDevSmokeText).mockResolvedValue({
      meta: {
        invocationId: "inv-1",
        providerResponseId: "resp_dev",
        usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
      },
      outcome: "SUCCESS",
      output: "pong",
    });

    const response = await postModelInvoke(modelInvokeRequest({ input: "ping" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      outcome: "SUCCESS",
      outputText: "pong",
      providerResponseId: "resp_dev",
      usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    expect(invokeDevSmokeText).toHaveBeenCalledExactlyOnceWith("ping");
  });

  it("returns a safe error summary, not the raw provider error, when invocation fails", async () => {
    vi.mocked(invokeDevSmokeText).mockRejectedValue(
      new ModelInvocationError({ code: "RATE_LIMITED" }),
    );

    const response = await postModelInvoke(modelInvokeRequest({ input: "ping" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "RATE_LIMITED",
      error: "The model provider rate-limited the invocation.",
    });
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

  it("returns 401 Unauthorized from the internal API when unauthenticated", async () => {
    vi.mocked(requestAuthenticator).mockResolvedValue(null);

    const response = await getFeatureFlags(featureFlagsRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject([
      { error: { data: { code: "UNAUTHORIZED" } } },
    ]);
  });
});
