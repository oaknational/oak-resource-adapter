import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchResourceArtifact,
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

describe("fetchResourceArtifact", () => {
  const options = {
    apiBaseUrl: "https://adapter.example/api/",
    artifactId: "artifact/id",
    signal: new AbortController().signal,
  };
  it("refreshes authentication on each delivery and returns binary content and its disposition", async () => {
    const getToken = vi
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(new Uint8Array([80, 75, 0, 255]), {
          headers: { "content-disposition": "attachment; filename=worksheet.docx" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchResourceArtifact({ ...options, getToken });
    await fetchResourceArtifact({ ...options, getToken });
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(
      new Uint8Array([80, 75, 0, 255]),
    );
    expect(result.contentDisposition).toBe("attachment; filename=worksheet.docx");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://adapter.example/api/resource-artifacts/artifact%2Fid",
      {
        headers: { Authorization: "Bearer second" },
        cache: "no-store",
        signal: options.signal,
      },
    );
  });
  it.each([401, 404, 503])("preserves HTTP %s for caller recovery", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(
      fetchResourceArtifact({ ...options, getToken: async () => "token" }),
    ).rejects.toMatchObject({ status });
  });
  it("does not send a request without a token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchResourceArtifact({ ...options, getToken: async () => null }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not fetch when cancelled while obtaining a token", async () => {
    const controller = new AbortController();
    const token = Promise.withResolvers<string>();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchResourceArtifact({
      ...options,
      signal: controller.signal,
      getToken: () => token.promise,
    });
    controller.abort();
    token.resolve("token");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
