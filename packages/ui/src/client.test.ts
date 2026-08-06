import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createResourceAdapterClient,
  createResourceAdapterInternalClient,
} from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createResourceAdapterClient", () => {
  it("constructs the public v1 endpoint and includes the version header", async () => {
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

    const client = createResourceAdapterClient({
      apiBaseUrl: "https://resource-adapter-api.example",
      getToken: async () => "token",
    });

    await client.capabilities.get.query({
      lessonSlug: "test",
      programmeSlug: "test",
      title: "test",
      subjectSlug: "test",
      keyStageSlug: "test",
      availableResources: [],
    });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("https://resource-adapter-api.example/trpc/v1");
    expect(request?.headers).toHaveProperty("x-resource-adapter-contract-version");
  });

  it("normalizes trailing slashes and preserves proxy paths", async () => {
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

    const client = createResourceAdapterClient({
      apiBaseUrl: "https://example.com/api/resource-adapter/",
      getToken: async () => "token",
    });

    await client.capabilities.get.query({
      lessonSlug: "test",
      programmeSlug: "test",
      title: "test",
      subjectSlug: "test",
      keyStageSlug: "test",
      availableResources: [],
    });

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("https://example.com/api/resource-adapter/trpc/v1");
    expect(String(url)).not.toContain("//trpc");
  });

  it.each([
    ["", "apiBaseUrl must be a non-empty absolute http(s) URL."],
    ["/api/resource-adapter", "apiBaseUrl must be a valid absolute http(s) URL."],
    ["ftp://example.com", "apiBaseUrl must use http or https."],
  ])("rejects invalid apiBaseUrl %s", (apiBaseUrl, expectedMessage) => {
    expect(() =>
      createResourceAdapterClient({
        apiBaseUrl,
        getToken: async () => "token",
      }),
    ).toThrow(expectedMessage);
  });
});

describe("createResourceAdapterInternalClient", () => {
  it("constructs the internal endpoint without the version header", async () => {
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

    const client = createResourceAdapterInternalClient({
      apiBaseUrl: "https://resource-adapter-api.example",
      getToken: async () => "token",
    });

    await client.featureFlags.get.query();

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("https://resource-adapter-api.example/trpc/internal");
    expect(request?.headers).not.toHaveProperty("x-resource-adapter-contract-version");
  });

  it("normalizes trailing slashes and preserves proxy paths", async () => {
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

    const client = createResourceAdapterInternalClient({
      apiBaseUrl: "https://example.com/api/resource-adapter/",
      getToken: async () => "token",
    });

    await client.featureFlags.get.query();

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "https://example.com/api/resource-adapter/trpc/internal",
    );
    expect(String(url)).not.toContain("//trpc");
  });

  it.each([
    ["", "apiBaseUrl must be a non-empty absolute http(s) URL."],
    ["/api/resource-adapter", "apiBaseUrl must be a valid absolute http(s) URL."],
    ["ftp://example.com", "apiBaseUrl must use http or https."],
  ])("rejects invalid apiBaseUrl %s", (apiBaseUrl, expectedMessage) => {
    expect(() =>
      createResourceAdapterInternalClient({
        apiBaseUrl,
        getToken: async () => "token",
      }),
    ).toThrow(expectedMessage);
  });
});
