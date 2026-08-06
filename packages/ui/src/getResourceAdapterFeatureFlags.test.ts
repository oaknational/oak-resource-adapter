import { afterEach, describe, expect, it, vi } from "vitest";

import { getResourceAdapterFeatureFlags } from "./getResourceAdapterFeatureFlags.js";
import { ResourceAdapterApiError } from "./errors.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getResourceAdapterFeatureFlags", () => {
  it("derives the internal endpoint from the public endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            result: { data: ["feature-flags-smoke-test-enabled"] },
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getResourceAdapterFeatureFlags({
      apiBaseUrl: "https://resource-adapter-api.example",
      getToken: async () => "clerk-token",
    });

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "https://resource-adapter-api.example/trpc/internal/featureFlags.get?batch=1",
    );
  });

  it("sends the host token through tRPC and returns the enabled flags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            result: { data: ["feature-flags-smoke-test-enabled"] },
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getResourceAdapterFeatureFlags({
        apiBaseUrl: "https://resource-adapter-api.example",
        getToken: async () => "clerk-token",
      }),
    ).resolves.toEqual(["feature-flags-smoke-test-enabled"]);

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(request).toMatchObject({
      headers: {
        Authorization: "Bearer clerk-token",
      },
      method: "POST",
    });
  });

  it("does not send the version header to the internal endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            result: { data: [] },
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getResourceAdapterFeatureFlags({
      apiBaseUrl: "https://resource-adapter-api.example",
      getToken: async () => "clerk-token",
    });

    const [, request] = fetchMock.mock.calls[0] ?? [];
    // The internal API should not require or validate the version header
    expect(request?.headers).not.toHaveProperty("x-resource-adapter-contract-version");
  });

  it("omits the authorization header when the host has no token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([{ result: { data: [] } }])));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getResourceAdapterFeatureFlags({
        apiBaseUrl: "https://resource-adapter-api.example",
        getToken: async () => null,
      }),
    ).resolves.toEqual([]);

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(request?.headers).not.toHaveProperty("Authorization");
  });

  it("reports the service status when the request is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              error: {
                message: "UNAUTHORIZED",
                code: -32001,
                data: { code: "UNAUTHORIZED", httpStatus: 401 },
              },
            },
          ]),
          { status: 401 },
        ),
      ),
    );

    await expect(
      getResourceAdapterFeatureFlags({
        apiBaseUrl: "https://resource-adapter-api.example",
        getToken: async () => null,
      }),
    ).rejects.toMatchObject({
      name: "ResourceAdapterApiError",
      message: "Resource Adapter could not load feature flags.",
      status: 401,
    });
  });

  it("reports a failure without a status when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const error = await getResourceAdapterFeatureFlags({
      apiBaseUrl: "https://resource-adapter-api.example",
      getToken: async () => "clerk-token",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ResourceAdapterApiError);
    expect(error).toMatchObject({
      message: "Resource Adapter could not load feature flags.",
      status: undefined,
    });
  });

  describe("endpoint derivation", () => {
    it.each([
      ["https://api.example", "https://api.example/trpc/internal"],
      ["https://api.example/", "https://api.example/trpc/internal"],
      [
        "https://api.example/resource-adapter",
        "https://api.example/resource-adapter/trpc/internal",
      ],
      ["http://localhost:3001", "http://localhost:3001/trpc/internal"],
    ])(
      "transforms %s to internal endpoint %s",
      async (apiBaseUrl, expectedInternalEndpoint) => {
        const fetchMock = vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify([{ result: { data: [] } }])));
        vi.stubGlobal("fetch", fetchMock);

        await getResourceAdapterFeatureFlags({
          apiBaseUrl,
          getToken: async () => "test-token",
        });

        const [url] = fetchMock.mock.calls[0] ?? [];
        expect(String(url)).toContain(expectedInternalEndpoint);
      },
    );
  });
});
