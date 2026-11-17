import { afterEach, describe, expect, it, vi } from "vitest";

import { getResourceAdapterCapabilityAvailability } from "./getResourceAdapterCapabilityAvailability.js";
import { ResourceAdapterApiError } from "./errors.js";

const lesson = {
  lessonSlug: "adding-fractions",
  programmeSlug: "ks2-maths",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"] as const,
};

const apiBaseUrl = "https://resource-adapter-api.example";

function respondWith(body: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify([{ result: { data: body } }])));
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getResourceAdapterCapabilityAvailability", () => {
  it("reports availability without sending a token", async () => {
    const fetchMock = respondWith({ available: true, teachingMaterials: [] });

    await expect(
      getResourceAdapterCapabilityAvailability({ apiBaseUrl, lesson }),
    ).resolves.toEqual({ available: true, teachingMaterials: [] });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "https://resource-adapter-api.example/trpc/v1/capabilities.available?batch=1",
    );
    expect(request).toMatchObject({
      headers: { "x-resource-adapter-contract-version": "1" },
      method: "POST",
    });
    expect(request).not.toHaveProperty("headers.Authorization");
  });

  it("tells the service which capabilities this package can render", async () => {
    const fetchMock = respondWith({ available: false, teachingMaterials: [] });

    await expect(
      getResourceAdapterCapabilityAvailability({ apiBaseUrl, lesson }),
    ).resolves.toEqual({ available: false, teachingMaterials: [] });

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String((request as RequestInit).body))).toEqual({
      "0": { ...lesson, supportedCapabilityIds: ["worksheetScaffolding"] },
    });
  });

  it("returns the teaching materials this package can link to, in menu order", async () => {
    respondWith({
      available: false,
      teachingMaterials: [
        "additional-exit-quiz",
        "unknown-material",
        "additional-glossary",
      ],
    });

    await expect(
      getResourceAdapterCapabilityAvailability({ apiBaseUrl, lesson }),
    ).resolves.toEqual({
      available: false,
      teachingMaterials: ["additional-glossary", "additional-exit-quiz"],
    });
  });

  it("rejects a response that is not the agreed shape", async () => {
    respondWith({ availability: "yes" });

    await expect(
      getResourceAdapterCapabilityAvailability({ apiBaseUrl, lesson }),
    ).rejects.toBeInstanceOf(ResourceAdapterApiError);
  });

  it("reports a transport failure as an api error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(
      getResourceAdapterCapabilityAvailability({ apiBaseUrl, lesson }),
    ).rejects.toBeInstanceOf(ResourceAdapterApiError);
  });

  it("keeps a proxy path when resolving the endpoint", async () => {
    const fetchMock = respondWith({ available: true, teachingMaterials: [] });

    await getResourceAdapterCapabilityAvailability({
      apiBaseUrl: "https://resource-adapter-api.example/proxy/resource-adapter/",
      lesson,
    });

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "https://resource-adapter-api.example/proxy/resource-adapter/trpc/v1/capabilities.available?batch=1",
    );
  });
});
