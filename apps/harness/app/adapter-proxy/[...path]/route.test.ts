import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const fetchMock = vi.fn();

function callProxy(path: string[]): Promise<Response> {
  return GET(
    new NextRequest(`https://harness.example.com/adapter-proxy/${path.join("/")}`),
    {
      params: Promise.resolve({ path }),
    },
  );
}

function forwardedHeaders(): Headers {
  return (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers;
}

beforeEach(() => {
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  process.env.RESOURCE_ADAPTER_API_ORIGIN = "https://api.example.com";
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  delete process.env.RESOURCE_ADAPTER_API_ORIGIN;
  delete process.env.RESOURCE_ADAPTER_API_BYPASS_SECRET;
  delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
});

describe("the adapter proxy", () => {
  it("sends the API's bypass secret", async () => {
    process.env.RESOURCE_ADAPTER_API_BYPASS_SECRET = "api-secret";

    await callProxy(["health"]);

    expect(forwardedHeaders().get("x-vercel-protection-bypass")).toBe("api-secret");
  });

  // Vercel injects VERCEL_AUTOMATION_BYPASS_SECRET into the harness with the
  // harness's own secret, which opens nothing on the API. Reading it would send
  // a credential that always fails and look like a broken deployment.
  it("ignores the harness's own bypass secret", async () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "harness-secret";

    await callProxy(["health"]);

    expect(forwardedHeaders().has("x-vercel-protection-bypass")).toBe(false);
  });
});
