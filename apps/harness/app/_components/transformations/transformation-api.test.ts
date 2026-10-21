import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { TransformationCommand } from "@oaknational/resource-adapter-dev-api-contracts";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  fetchTransformationCatalogue,
  previewTransformation,
  runTransformation,
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
  it("reads the registry catalogue", async () => {
    respond({
      capabilities: [
        {
          id: "worksheetScaffolding",
          label: "Add extra scaffolding",
          resourceType: "worksheet",
          suggestionFlowId: "worksheet-scaffolding",
          transformationKinds: ["scaffold-add-word-bank"],
        },
      ],
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
          status: "retired",
          suggestion: {
            avoidWhen: "The question already supplies the vocabulary.",
            description: "Adds vocabulary for one question.",
            useWhen: "Relevant vocabulary needs recalling.",
          },
          inputs: [
            {
              id: "supportLevel",
              kind: "choice",
              label: "Support level",
              options: [
                { value: "low", label: "Low", description: "Words only." },
                {
                  value: "mid",
                  label: "Mid",
                  description: "Words and definitions.",
                },
              ],
            },
          ],
          target: { scope: "node", nodeTypes: ["question"] },
        },
      ],
    });

    await expect(fetchTransformationCatalogue()).resolves.toMatchObject({
      capabilities: [
        {
          id: "worksheetScaffolding",
          transformationKinds: ["scaffold-add-word-bank"],
        },
      ],
      material: [{ key: "lesson.keywords", promptHeading: "LESSON KEYWORDS" }],
      transformations: [
        {
          kind: "scaffold-add-word-bank",
          status: "retired",
          suggestion: { description: "Adds vocabulary for one question." },
        },
      ],
    });
  });

  it("reads a preview", async () => {
    respond({
      execution: "structured-model",
      kind: "scaffold-add-word-bank",
      prompt: { identifier: "scaffold-add-word-bank", text: "Rendered" },
      status: "retired",
      warnings: [],
    });

    await expect(previewTransformation(command())).resolves.toMatchObject({
      prompt: { text: "Rendered" },
      status: "retired",
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

  it("ignores fields a newer API adds", async () => {
    respond({
      run: {
        meta: { cachedTokens: 12, invocationId: "invocation-1" },
        outcome: "TEXT",
        text: "Draft output",
      },
      servedAt: "2026-10-21T12:00:00.000Z",
      warnings: [],
    });

    await expect(runTransformation(command())).resolves.toEqual({
      run: {
        meta: { invocationId: "invocation-1" },
        outcome: "TEXT",
        text: "Draft output",
      },
      warnings: [],
    });
  });

  it("surfaces the API's safe error message", async () => {
    respond({ error: "Dev routes are not enabled." }, 404);

    await expect(runTransformation(command())).rejects.toThrow(
      "Dev routes are not enabled.",
    );
  });
});
