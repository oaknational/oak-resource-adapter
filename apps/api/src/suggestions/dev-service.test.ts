import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import { getDevSuggestionCatalogue, previewDevSuggestionFlow } from "./dev-service";
import type { ResourceDocument } from "@oaknational/resource-document";

let worksheet: ResourceDocument;

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
    source: "oak",
  });
});

describe("development suggestion service", () => {
  it("lists the registered suggestion flows", () => {
    expect(getDevSuggestionCatalogue()).toMatchObject({
      flows: [
        {
          capabilityId: "worksheetScaffolding",
          id: "worksheet-scaffolding",
          maxSuggestions: 5,
        },
      ],
    });
  });

  it("renders the production suggestion prompt without storing it", async () => {
    const preview = await previewDevSuggestionFlow({
      appliedTransformations: [],
      document: worksheet,
      flowId: "worksheet-scaffolding",
    });

    expect(preview.prompt).toMatchObject({
      identifier: "worksheet-scaffolding-suggestions",
    });
    expect(preview.prompt.text).toContain("AVAILABLE TRANSFORMATIONS");
    expect(preview.prompt.text).toContain("CURRENT WORKSHEET");
    expect(preview.candidates.length).toBeGreaterThan(0);
  });
});
