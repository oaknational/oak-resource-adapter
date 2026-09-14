import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

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
  it("forwards a DOCX download's body, status and response headers", async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 0, 255]);
    const contentType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    fetchMock.mockResolvedValueOnce(
      new Response(bytes, {
        headers: {
          "cache-control": "no-store",
          "content-disposition": 'attachment; filename="worksheet.docx"',
          "content-type": contentType,
          "x-private-header": "not-forwarded",
        },
        status: 200,
      }),
    );
    const body = JSON.stringify({ document: { id: "fixture" }, embedFigures: false });

    const response = await POST(
      new NextRequest("https://harness.example.com/adapter-proxy/dev/exports/docx", {
        body,
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      { params: Promise.resolve({ path: ["dev", "exports", "docx"] }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="worksheet.docx"',
    );
    expect(response.headers.get("content-type")).toBe(contentType);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("x-private-header")).toBe(false);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/dev/exports/docx" }),
      expect.objectContaining({ method: "POST", redirect: "manual" }),
    );
    expect(forwardedHeaders().get("content-type")).toBe("application/json");
    const forwarded = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new TextDecoder().decode(forwarded.body as ArrayBuffer)).toBe(body);
  });

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
