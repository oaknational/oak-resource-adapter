import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StructuredModelOutputResult } from "@oaknational/resource-adapter-ai";
import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

import type { ResourceAdapterModelInvoker } from "../ai/model-roles";
import {
  executeRegisteredTransformation,
  prepareRegisteredTransformation,
  previewRegisteredTransformation,
  type ResolveTransformationMaterial,
} from "./application-service";
import type { PreparePrompt } from "./execute";

const lesson = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
};

let worksheet: ResourceDocument;
let question: QuestionNode;

const prepare = vi.fn<PreparePrompt>(({ template, variables }) =>
  Promise.resolve({
    promptTemplateId: `dev-${template.identifier}`,
    text: `rendered with ${Object.keys(variables).sort().join(", ")}`,
  }),
);

function invokerReturning(output: unknown): ResourceAdapterModelInvoker {
  const structured: StructuredModelOutputResult<unknown> = {
    meta: { invocationId: "11111111-1111-1111-1111-111111111111" },
    outcome: "SUCCESS",
    output,
  };

  return {
    invoke: vi.fn(),
    invokeStructured: vi.fn(() => Promise.resolve(structured)),
    invokeText: vi.fn(),
  } as unknown as ResourceAdapterModelInvoker;
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    document: worksheet,
    kind: "scaffold-add-glossary-question",
    lesson,
    params: { supportLevel: "low" },
    targetBlockId: question.id,
    ...overrides,
  };
}

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    ...lesson,
    resourceType: "worksheet",
  });
  const first = worksheet.content.find(
    (node): node is QuestionNode => node.type === "question",
  );
  if (first === undefined) {
    throw new Error("The fixture has no question.");
  }
  question = first;
});

describe("prepareRegisteredTransformation", () => {
  it("rejects a transformation the registry does not hold", async () => {
    await expect(
      prepareRegisteredTransformation(command({ kind: "scaffold-invent-something" })),
    ).rejects.toThrow(/Unknown transformation/);
  });

  it("asks the resolver for exactly the material the transformation declares", async () => {
    const resolveMaterial = vi.fn<ResolveTransformationMaterial>(() =>
      Promise.resolve({ material: {}, warnings: [] }),
    );

    await prepareRegisteredTransformation(command(), { prepare, resolveMaterial });

    expect(resolveMaterial).toHaveBeenCalledWith(
      [
        { key: "lesson.slides", required: false },
        { key: "lesson.keywords", required: false },
      ],
      lesson,
    );
  });

  it("uses material the caller supplied rather than resolving any", async () => {
    const resolveMaterial = vi.fn<ResolveTransformationMaterial>(() =>
      Promise.resolve({ material: {}, warnings: [] }),
    );

    const { prepared } = await prepareRegisteredTransformation(
      command({
        material: {
          "lesson.keywords": {
            kind: "keywords",
            keywords: [{ keyword: "perspective", description: "whose eyes" }],
          },
        },
      }),
      { prepare, resolveMaterial },
    );

    expect(resolveMaterial).not.toHaveBeenCalled();
    expect(prepared.material["lesson.keywords"]).toBeDefined();
  });

  it("carries the resolver's warnings back to the caller", async () => {
    const { warnings } = await prepareRegisteredTransformation(command(), {
      prepare,
      resolveMaterial: () =>
        Promise.resolve({ material: {}, warnings: ["Lesson keywords are absent."] }),
    });

    expect(warnings).toEqual(["Lesson keywords are absent."]);
  });
});

describe("previewRegisteredTransformation", () => {
  it("returns the rendered prompt without invoking a model", async () => {
    const preview = await previewRegisteredTransformation(command(), { prepare });

    expect(preview).toMatchObject({
      execution: "structured-model",
      kind: "scaffold-add-glossary-question",
      status: "active",
    });
    expect(preview.prompt?.text).toContain("rendered with");
  });

  it("has no prompt to show for a deterministic transformation", async () => {
    const preview = await previewRegisteredTransformation(
      command({ kind: "identity", params: {}, targetBlockId: undefined }),
      { prepare },
    );

    expect(preview).toMatchObject({ execution: "deterministic", prompt: null });
  });
});

describe("executeRegisteredTransformation", () => {
  it("runs the transformation the command named and returns its documents", async () => {
    const { run, warnings } = await executeRegisteredTransformation(
      command({ contributionId: "contribution-1" }),
      {
        invoker: invokerReturning({
          entries: [{ definition: "whose eyes we see through", term: "perspective" }],
        }),
        prepare,
      },
    );

    expect(warnings).toEqual([]);
    expect(run.outcome).toBe("APPLIED");
    expect(run.outcome === "APPLIED" ? run.outputs[0].purpose : undefined).toBe(
      "revised-resource",
    );
  });
});
