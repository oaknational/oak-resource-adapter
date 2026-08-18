import { describe, expect, it, vi } from "vitest";

import * as publicApi from "./index.js";
import {
  createOriginalResourceDocumentReader,
  originalResourceDocuments,
  type OriginalResourceDocumentLocator,
  type OriginalResourceDocumentProvider,
} from "./index.js";

const locator: OriginalResourceDocumentLocator = {
  source: "oak",
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
  resourceType: "worksheet",
};

function stubProvider(
  overrides: Partial<OriginalResourceDocumentProvider>,
): OriginalResourceDocumentProvider {
  return {
    getMarkup: vi.fn().mockResolvedValue(""),
    listExtractedResourceTypes: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("original resource document retrieval", () => {
  it("exports a deliberately small surface", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "OriginalResourceDocumentError",
      "createOriginalResourceDocumentReader",
      "originalResourceDocuments",
    ]);
  });

  it("gets a validated document by Oak lesson resource identity", async () => {
    await expect(originalResourceDocuments.get(locator)).resolves.toMatchObject({
      profile: "worksheet.v0",
      metadata: { title: "Adopting different perspectives" },
      provenance: { source: { id: `${locator.lessonSlug}:worksheet` } },
      schemaVersion: "0.1",
    });
  });

  it.each([
    ["lessonSlug", ""],
    ["programmeSlug", "   "],
    ["resourceType", ""],
  ] as const)("rejects an unusable %s", async (field, value) => {
    await expect(
      originalResourceDocuments.get({ ...locator, [field]: value }),
    ).rejects.toMatchObject({ code: "invalid-locator" });
  });

  it("does not silently substitute another programme or resource type", async () => {
    await expect(
      originalResourceDocuments.get({ ...locator, programmeSlug: "another-programme" }),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      originalResourceDocuments.get({ ...locator, resourceType: "slide-deck" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("returns the extraction markup a caller asks for unparsed", async () => {
    await expect(originalResourceDocuments.getMarkup(locator)).resolves.toContain(
      'profile: "worksheet.v0"',
    );
  });

  it("rejects markup this version cannot parse", async () => {
    const provider = stubProvider({
      getMarkup: vi.fn().mockResolvedValue("no frontmatter here"),
    });
    const reader = createOriginalResourceDocumentReader(provider);

    await expect(reader.get(locator)).rejects.toMatchObject({
      code: "malformed-document",
      cause: expect.any(Error),
    });
    expect(provider.getMarkup).toHaveBeenCalledWith(locator);
  });

  it("normalises unrecognised provider failures", async () => {
    const cause = new Error("network details");
    const reader = createOriginalResourceDocumentReader(
      stubProvider({ getMarkup: vi.fn().mockRejectedValue(cause) }),
    );

    await expect(reader.get(locator)).rejects.toMatchObject({
      cause,
      code: "upstream-unavailable",
    });
    await expect(reader.getMarkup(locator)).rejects.toMatchObject({
      cause,
      code: "upstream-unavailable",
    });
  });
});

describe("original resource document availability", () => {
  const lesson = {
    source: "oak",
    lessonSlug: locator.lessonSlug,
    programmeSlug: locator.programmeSlug,
  } as const;

  it("lists the resource types the corpus holds an extraction for", async () => {
    await expect(
      originalResourceDocuments.listExtractedResourceTypes(lesson),
    ).resolves.toEqual(["worksheet"]);
  });

  it("returns nothing for a lesson outside the corpus", async () => {
    await expect(
      originalResourceDocuments.listExtractedResourceTypes({
        ...lesson,
        lessonSlug: "not-a-lesson",
      }),
    ).resolves.toEqual([]);
  });

  it("rejects an unusable lesson reference without asking the provider", async () => {
    const provider = stubProvider({});
    const reader = createOriginalResourceDocumentReader(provider);

    await expect(
      reader.listExtractedResourceTypes({ ...lesson, lessonSlug: " " }),
    ).rejects.toMatchObject({ code: "invalid-locator" });
    expect(provider.listExtractedResourceTypes).not.toHaveBeenCalled();
  });
});
