import { afterEach, describe, expect, it, vi } from "vitest";

import { getResourceAdapterFeatureFlags } from "./getResourceAdapterFeatureFlags.js";
import { ResourceAdapterApiError } from "./getResourceAdapterCapabilities.js";

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
      getToken: async () => "clerk-token",
      trpcEndpoint: "https://resource-adapter-api.example/trpc/v1",
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
        getToken: async () => "clerk-token",
        trpcEndpoint: "https://resource-adapter-api.example/trpc/v1",
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
      getToken: async () => "clerk-token",
      trpcEndpoint: "https://resource-adapter-api.example/trpc/v1",
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
        getToken: async () => null,
        trpcEndpoint: "https://resource-adapter-api.example/trpc/v1",
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
        getToken: async () => null,
        trpcEndpoint: "https://resource-adapter-api.example/trpc/v1",
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
      getToken: async () => "clerk-token",
      trpcEndpoint: "https://resource-adapter-api.example/trpc/v1",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ResourceAdapterApiError);
    expect(error).toMatchObject({
      message: "Resource Adapter could not load feature flags.",
      status: undefined,
    });
  });

  describe("endpoint derivation", () => {
    it.each([
      ["https://api.example/trpc/v1", "https://api.example/trpc/internal"],
      [
        "https://api.example/resource-adapter/trpc/v1",
        "https://api.example/resource-adapter/trpc/internal",
      ],
      ["http://localhost:3001/trpc/v1", "http://localhost:3001/trpc/internal"],
      ["https://api.example/trpc/v2", "https://api.example/trpc/internal"],
    ])("transforms %s to %s", async (publicEndpoint, expectedInternalEndpoint) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify([{ result: { data: [] } }])));
      vi.stubGlobal("fetch", fetchMock);

      await getResourceAdapterFeatureFlags({
        getToken: async () => "token",
        trpcEndpoint: publicEndpoint,
      });

      const [actualUrl] = fetchMock.mock.calls[0] ?? [];
      expect(String(actualUrl)).toContain(expectedInternalEndpoint);
    });
  });
});
