import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getResourceAdapterCapabilities,
  ResourceAdapterApiError,
} from "./getResourceAdapterCapabilities.js";

const lesson = {
  lessonSlug: "adding-fractions",
  programmeSlug: "ks2-maths",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"] as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getResourceAdapterCapabilities", () => {
  it("sends versioned lesson context and the host token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          capabilities: [
            {
              id: "worksheetAdapter",
              label: "Adapt worksheet",
              resourceType: "worksheet",
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getResourceAdapterCapabilities({
        apiBaseUrl: "https://resource-adapter-api.example",
        getToken: async () => "clerk-token",
        lesson,
      }),
    ).resolves.toMatchObject({
      capabilities: [{ id: "worksheetAdapter" }],
    });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://resource-adapter-api.example/v1/capabilities");
    expect(request).toMatchObject({
      body: JSON.stringify({ contractVersion: 1, lesson }),
      headers: {
        Authorization: "Bearer clerk-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("rejects an invalid API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            capabilities: [
              {
                id: "unknownAdapter",
                label: "Unknown adapter",
                resourceType: "worksheet",
              },
            ],
          }),
        ),
      ),
    );

    await expect(
      getResourceAdapterCapabilities({
        apiBaseUrl: "https://resource-adapter-api.example",
        getToken: async () => null,
        lesson,
      }),
    ).rejects.toBeInstanceOf(ResourceAdapterApiError);
  });
});
