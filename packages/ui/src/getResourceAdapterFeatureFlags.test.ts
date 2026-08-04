import { afterEach, describe, expect, it, vi } from "vitest";

import { getResourceAdapterFeatureFlags } from "./getResourceAdapterFeatureFlags.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getResourceAdapterFeatureFlags", () => {
  it("sends host token through tRPC without lesson context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            result: {
              data: ["feature-flags-smoke-test-enabled"],
            },
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

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "https://resource-adapter-api.example/trpc/v1/featureFlags.get?batch=1",
    );
    expect(request).toMatchObject({
      headers: {
        Authorization: "Bearer clerk-token",
        "x-resource-adapter-contract-version": "1",
      },
      method: "POST",
    });
    expect(String((request as RequestInit).body)).not.toContain("lessonSlug");
  });
});
