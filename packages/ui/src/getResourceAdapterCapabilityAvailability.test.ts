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
    const fetchMock = respondWith({ available: true });

    await expect(
      getResourceAdapterCapabilityAvailability({ apiBaseUrl, lesson }),
    ).resolves.toBe(true);

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
    const fetchMock = respondWith({ available: false });

    await expect(
      getResourceAdapterCapabilityAvailability({ apiBaseUrl, lesson }),
    ).resolves.toBe(false);

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String((request as RequestInit).body))).toEqual({
      "0": { ...lesson, supportedCapabilityIds: ["worksheetAdapter"] },
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
    const fetchMock = respondWith({ available: true });

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
