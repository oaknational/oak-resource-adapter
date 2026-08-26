import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  fetchSuggestionCatalogue,
  previewSuggestions,
  runSuggestions,
  type SuggestionCommand,
} from "./suggestion-api";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

function command(): SuggestionCommand {
  return { document: worksheet, flowId: "worksheet-scaffolding" };
}

function respond(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status,
      }),
    ),
  );
}

const flow = {
  capabilityId: "worksheetScaffolding",
  id: "worksheet-scaffolding",
  maxSuggestions: 5,
  role: "worksheet-scaffolding-suggester",
  transformationKinds: ["scaffold-add-word-bank"],
};

describe("suggestion harness API", () => {
  it("reads the suggestion-flow catalogue", async () => {
    respond({ flows: [flow] });

    await expect(fetchSuggestionCatalogue()).resolves.toEqual({ flows: [flow] });
  });

  it("posts a preview and validates its prompt and candidates", async () => {
    respond({
      candidates: [
        {
          eligibleTargets: { blockIds: ["question-1"], scope: "node" },
          kind: "scaffold-add-word-bank",
          label: "Add a word bank",
          outputs: ["revised-resource"],
          supportLevels: [{ description: "Words only.", level: "low" }],
          target: { nodeTypes: ["question"], scope: "node" },
        },
      ],
      flow,
      prompt: {
        identifier: "worksheet-scaffolding-suggestions",
        text: "Prompt",
      },
    });

    await expect(previewSuggestions(command())).resolves.toMatchObject({
      candidates: [{ kind: "scaffold-add-word-bank" }],
      prompt: { text: "Prompt" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/adapter-proxy/dev/suggestions/preview",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("accepts an empty validated result and forwards cancellation", async () => {
    respond({ flowId: "worksheet-scaffolding", suggestions: [] });
    const controller = new AbortController();

    await expect(runSuggestions(command(), controller.signal)).resolves.toEqual({
      flowId: "worksheet-scaffolding",
      suggestions: [],
    });
    expect(fetch).toHaveBeenCalledWith(
      "/adapter-proxy/dev/suggestions/run",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("validates suggested parameters and target IDs", async () => {
    respond({
      flowId: "worksheet-scaffolding",
      suggestions: [
        {
          kind: "scaffold-add-word-bank",
          label: "Add a word bank",
          params: { supportLevel: "low" },
          reason: "This task uses several subject-specific words.",
          targetBlockId: "question-1",
        },
      ],
    });

    await expect(runSuggestions(command())).resolves.toMatchObject({
      suggestions: [{ targetBlockId: "question-1" }],
    });
  });

  it("surfaces the API's safe error message", async () => {
    respond({ error: "Dev routes are not enabled." }, 404);

    await expect(runSuggestions(command())).rejects.toThrow(
      "Dev routes are not enabled.",
    );
  });
});
