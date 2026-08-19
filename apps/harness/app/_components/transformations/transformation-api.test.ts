import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  fetchTransformationCatalogue,
  previewTransformation,
  runTransformation,
  type TransformationCommand,
} from "./transformation-api";
import type { ResourceDocument } from "@oaknational/resource-document";

let worksheet: ResourceDocument;

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function command(): TransformationCommand {
  return {
    document: worksheet,
    kind: "scaffold-add-word-bank",
    lesson: {
      lessonSlug: "adopting-different-perspectives",
      programmeSlug: "english-primary-ks2",
    },
    params: { supportLevel: "low" },
    targetBlockId: "question-1",
  };
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

describe("transformation harness API", () => {
  it("reads the serialisable registry catalogue", async () => {
    respond({
      material: [
        {
          available: true,
          key: "lesson.keywords",
          label: "Lesson keywords",
          promptHeading: "LESSON KEYWORDS",
        },
      ],
      transformations: [
        {
          execution: "structured-model",
          kind: "scaffold-add-word-bank",
          label: "Add a word bank",
          materialRequirements: [
            {
              available: true,
              key: "lesson.keywords",
              label: "Lesson keywords",
              required: false,
            },
          ],
          outputs: ["revised-resource"],
          status: "active",
          supportLevels: [
            { level: "low", description: "Words only." },
            { level: "mid", description: "Words and definitions." },
          ],
          target: { scope: "node", nodeTypes: ["question"] },
        },
      ],
    });

    await expect(fetchTransformationCatalogue()).resolves.toMatchObject({
      material: [{ key: "lesson.keywords", promptHeading: "LESSON KEYWORDS" }],
      transformations: [{ kind: "scaffold-add-word-bank", status: "active" }],
    });
  });

  it("posts a preview and validates its prompt", async () => {
    respond({
      execution: "structured-model",
      kind: "scaffold-add-word-bank",
      prompt: { identifier: "scaffold-add-word-bank", text: "Rendered", version: 1 },
      status: "active",
      warnings: [],
    });

    await expect(previewTransformation(command())).resolves.toMatchObject({
      prompt: { text: "Rendered" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/adapter-proxy/dev/transformations/preview",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards cancellation to a transformation request", async () => {
    respond({
      execution: "deterministic",
      kind: "identity",
      prompt: null,
      status: "draft",
      warnings: [],
    });
    const controller = new AbortController();

    await previewTransformation(command(), controller.signal);

    expect(fetch).toHaveBeenCalledWith(
      "/adapter-proxy/dev/transformations/preview",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("accepts a validated transformed document", async () => {
    respond({
      run: {
        outcome: "APPLIED",
        outputs: [{ document: worksheet, purpose: "revised-resource" }],
      },
      warnings: [],
    });

    await expect(runTransformation(command())).resolves.toMatchObject({
      run: { outcome: "APPLIED" },
    });
  });

  it("surfaces the API's safe error message", async () => {
    respond({ error: "Dev routes are not enabled." }, 404);

    await expect(runTransformation(command())).rejects.toThrow(
      "Dev routes are not enabled.",
    );
  });
});
