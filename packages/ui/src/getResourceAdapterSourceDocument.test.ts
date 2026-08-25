import { afterEach, describe, expect, it, vi } from "vitest";

import { getResourceAdapterSourceDocument } from "./getResourceAdapterSourceDocument.js";

const lesson = {
  lessonSlug: "adding-fractions",
  programmeSlug: "ks2-maths",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
} as const;

const sourceDocument = {
  schemaVersion: "0.1",
  id: "oak:worksheet:adding-fractions:pupil",
  profile: "worksheet.v0",
  language: "en-GB",
  metadata: { title: "Adding fractions" },
  content: [],
  answers: [],
  assets: [],
  provenance: {
    source: { system: "oak", id: "adding-fractions" },
    producer: { name: "test", version: "1" },
  },
  diagnostics: [],
};

function successfulResponse(data: unknown) {
  return new Response(JSON.stringify([{ result: { data } }]));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getResourceAdapterSourceDocument", () => {
  it("retrieves the selected capability document through the internal API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse(sourceDocument));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getResourceAdapterSourceDocument({
        apiBaseUrl: "https://resource-adapter-api.example",
        capabilityId: "worksheetAdapter",
        getToken: async () => "clerk-token",
        lesson,
      }),
    ).resolves.toEqual(sourceDocument);

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "https://resource-adapter-api.example/trpc/internal/sourceDocuments.get?batch=1",
    );
    expect(request).toMatchObject({
      headers: { Authorization: "Bearer clerk-token" },
      method: "POST",
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      "0": { capabilityId: "worksheetAdapter", lesson },
    });
  });

  it("preserves the service status when retrieval is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              error: {
                message: "NOT_FOUND",
                code: -32004,
                data: { code: "NOT_FOUND", httpStatus: 404 },
              },
            },
          ]),
          { status: 404 },
        ),
      ),
    );

    await expect(
      getResourceAdapterSourceDocument({
        apiBaseUrl: "https://resource-adapter-api.example",
        capabilityId: "worksheetAdapter",
        getToken: async () => "clerk-token",
        lesson,
      }),
    ).rejects.toMatchObject({
      message: "Resource Adapter could not load the source worksheet.",
      status: 404,
    });
  });
});
