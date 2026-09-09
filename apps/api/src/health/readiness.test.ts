import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getHealth } from "../../app/health/route";
import { dynamic, GET, OPTIONS } from "../../app/health/ready/route";

const { openai, recorder } = vi.hoisted(() => ({
  openai: vi.fn(),
  recorder: vi.fn(),
}));

vi.mock("openai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("openai")>()),
  default: openai,
}));
vi.mock("@oaknational/resource-adapter-ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@oaknational/resource-adapter-ai")>()),
  createDatabaseInvocationRecorder: recorder,
}));

const request = () =>
  new NextRequest("http://localhost:3001/health/ready", {
    headers: { Origin: "http://localhost:3000" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MODEL_TRANSPORT", undefined);
  vi.stubEnv("OPENAI_API_KEY", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("RESOURCE_ADAPTER_ALLOWED_ORIGINS", "http://localhost:3000");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Readiness must not use the network");
    }),
  );
});

afterEach(() => {
  expect(openai).not.toHaveBeenCalled();
  expect(recorder).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("configuration readiness", () => {
  it.each([undefined, "openai"])(
    "accepts configured OpenAI with selector %s",
    async (selector) => {
      vi.stubEnv("MODEL_TRANSPORT", selector);
      vi.stubEnv("OPENAI_API_KEY", "test-value-not-validated-with-provider");
      const response = GET(request());
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "ready",
        checks: {
          modelConfiguration: {
            label: "Model configuration",
            status: "ready",
            message: "OpenAI transport configured.",
          },
        },
      });
    },
  );

  it("accepts explicit deterministic mode without a key in a production build", async () => {
    vi.stubEnv("MODEL_TRANSPORT", "deterministic");
    vi.stubEnv("NODE_ENV", "production");
    const response = GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      checks: {
        modelConfiguration: {
          status: "ready",
          message: "Deterministic transport configured.",
        },
      },
    });
  });

  it.each([
    {
      selector: undefined,
      key: undefined,
      vercel: undefined,
      code: "MISSING_OPENAI_API_KEY",
      message: "OPENAI_API_KEY is not configured.",
    },
    {
      selector: "openai",
      key: " \n\t",
      vercel: undefined,
      code: "MISSING_OPENAI_API_KEY",
      message: "OPENAI_API_KEY is not configured.",
    },
    {
      selector: "secret-value-in-the-wrong-variable",
      key: "secret-key",
      vercel: undefined,
      code: "UNKNOWN_MODEL_TRANSPORT",
      message: "MODEL_TRANSPORT must be openai or deterministic.",
    },
    {
      selector: "deterministic",
      key: "secret-key",
      vercel: "production",
      code: "DETERMINISTIC_TRANSPORT_FORBIDDEN",
      message: "Deterministic model transport is not allowed in production.",
    },
  ])(
    "reports $code without exposing environment values",
    async ({ selector, key, vercel, code, message }) => {
      vi.stubEnv("MODEL_TRANSPORT", selector);
      vi.stubEnv("OPENAI_API_KEY", key);
      vi.stubEnv("VERCEL_ENV", vercel);
      const response = GET(request());
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toMatchObject({
        status: "not-ready",
        checks: {
          modelConfiguration: {
            label: "Model configuration",
            status: "not-ready",
            code,
            message,
            retryable: false,
          },
        },
      });
      expect(JSON.stringify(body)).not.toContain("secret-");
      expect(JSON.stringify(body)).not.toContain("stack");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "http://localhost:3000",
      );
    },
  );

  it("reevaluates configuration on every uncached request", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(GET(request()).status).toBe(503);
    vi.stubEnv("MODEL_TRANSPORT", "deterministic");
    const response = GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("keeps liveness and preflight available without model configuration", async () => {
    const health = getHealth(request());
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: "ok" });
    const preflight = OPTIONS(request());
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
  });
});
