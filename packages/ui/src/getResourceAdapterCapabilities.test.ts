import { afterEach, describe, expect, it, vi } from "vitest";

import { getResourceAdapterCapabilities } from "./getResourceAdapterCapabilities.js";

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
  it("sends lesson context and the host token through tRPC", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            result: {
              data: {
                capabilities: [
                  {
                    id: "worksheetAdapter",
                    label: "Adapt worksheet",
                    resourceType: "worksheet",
                  },
                ],
              },
            },
          },
        ]),
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
    expect(String(url)).toContain(
      "https://resource-adapter-api.example/trpc/v1/capabilities.get?batch=1",
    );
    expect(request).toMatchObject({
      body: JSON.stringify({ "0": lesson }),
      headers: {
        Authorization: "Bearer clerk-token",
        "x-resource-adapter-contract-version": "1",
      },
      method: "POST",
    });
  });

  it("ignores capabilities not supported by this package version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              result: {
                data: {
                  capabilities: [
                    {
                      id: "unknownAdapter",
                      label: "Unknown adapter",
                      resourceType: "worksheet",
                    },
                  ],
                },
              },
            },
          ]),
        ),
      ),
    );

    await expect(
      getResourceAdapterCapabilities({
        apiBaseUrl: "https://resource-adapter-api.example",
        getToken: async () => null,
        lesson,
      }),
    ).resolves.toEqual({ capabilities: [] });
  });

  it("resolves the public endpoint from apiBaseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            result: {
              data: {
                capabilities: [],
              },
            },
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getResourceAdapterCapabilities({
      apiBaseUrl: "https://resource-adapter-api.example/proxy/resource-adapter/",
      getToken: async () => "clerk-token",
      lesson,
    });

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "https://resource-adapter-api.example/proxy/resource-adapter/trpc/v1/capabilities.get?batch=1",
    );
  });
});
