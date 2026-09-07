import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { zodTextFormat } from "openai/helpers/zod";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  getResourceNodesByType,
  type ResourceDocument,
} from "@oaknational/resource-document";

import type { ResourceAdapterModelInvoker } from "../ai/model-roles";
import { dismissTransformationsAt } from "../transformations/dismissal";
import { worksheetScaffoldingSuggestionFlow } from "./definitions/worksheet-scaffolding";
import { generateSuggestions, prepareSuggestionFlow } from "./service";

let worksheet: ResourceDocument;
let questionId: string;
let questionIds: readonly string[];
let paragraphId: string;

const prepare = vi.fn(({ template, variables }) =>
  Promise.resolve({
    promptTemplateId: `test-${template.identifier}`,
    text: Object.values(variables).join("\n"),
  }),
);

function invokerWith(output: unknown): ResourceAdapterModelInvoker {
  return {
    invoke: vi.fn(),
    invokeText: vi.fn(),
    invokeStructured: vi.fn((request: { schema: z.ZodType }) => {
      zodTextFormat(request.schema, "test_transformation_suggestions");
      return Promise.resolve({
        meta: { invocationId: "11111111-1111-1111-1111-111111111111" },
        outcome: "SUCCESS",
        output,
      });
    }),
  } as unknown as ResourceAdapterModelInvoker;
}

function invokerWithOutcome(
  outcome: "INCOMPLETE" | "OUTPUT_MISSING" | "REFUSAL",
): ResourceAdapterModelInvoker {
  const failure =
    outcome === "INCOMPLETE"
      ? { outcome, reason: "MAX_OUTPUT_TOKENS" as const }
      : outcome === "REFUSAL"
        ? { outcome, refusal: "Cannot comply." }
        : { outcome };
  return {
    invoke: vi.fn(),
    invokeText: vi.fn(),
    invokeStructured: vi.fn(() =>
      Promise.resolve({
        ...failure,
        meta: { invocationId: "11111111-1111-1111-1111-111111111111" },
      }),
    ),
  } as unknown as ResourceAdapterModelInvoker;
}

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
  });
  const question = worksheet.content.find((node) => node.type === "question");
  const paragraph =
    question?.type === "question"
      ? question.children.find((node) => node.type === "paragraph")
      : undefined;
  if (question === undefined || paragraph === undefined) {
    throw new Error("The fixture needs a question containing a paragraph.");
  }
  questionId = question.id;
  questionIds = getResourceNodesByType(worksheet, "question").map(({ id }) => id);
  paragraphId = paragraph.id;
});

describe("worksheet scaffolding suggestions", () => {
  it("keeps every worksheet scaffold in the flow while offering only active kinds", async () => {
    const result = await prepareSuggestionFlow(
      worksheetScaffoldingSuggestionFlow,
      worksheet,
      [],
      prepare,
    );

    expect(result.candidates.map(({ kind }) => kind)).toEqual([
      "scaffold-add-word-bank",
      "scaffold-add-prompt-questions",
      "scaffold-chunk-tasks",
    ]);
    expect(result.candidates[0]?.eligibleTargets).toEqual({
      blockIds: questionIds,
      scope: "node",
    });
    expect(result.preparedPrompt.text).toContain("one of these eligible node IDs:");
    expect(result.preparedPrompt.text).not.toContain("scaffold-simplify-instructions");
  });

  it("offers each node transformation only for targets where it remains valid", async () => {
    const result = await prepareSuggestionFlow(
      worksheetScaffoldingSuggestionFlow,
      worksheet,
      [
        {
          kind: "scaffold-add-word-bank",
          params: { supportLevel: "low" },
          targetBlockId: questionId,
        },
      ],
      prepare,
    );

    const wordBank = result.candidates.find(
      ({ kind }) => kind === "scaffold-add-word-bank",
    );
    expect(wordBank?.eligibleTargets).toEqual({
      blockIds: questionIds.filter((id) => id !== questionId),
      scope: "node",
    });
  });

  it("does not offer node transformations at a target the teacher dismissed", async () => {
    const result = await prepareSuggestionFlow(
      worksheetScaffoldingSuggestionFlow,
      dismissTransformationsAt(worksheet, questionId),
      [],
      prepare,
    );

    const wordBank = result.candidates.find(
      ({ kind }) => kind === "scaffold-add-word-bank",
    );
    expect(wordBank?.eligibleTargets).toEqual({
      blockIds: questionIds.filter((id) => id !== questionId),
      scope: "node",
    });
  });

  it("returns validated parameters with a target and teacher-facing reason", async () => {
    await expect(
      generateSuggestions(worksheetScaffoldingSuggestionFlow, worksheet, [], {
        invoker: invokerWith({
          suggestions: [
            {
              kind: "scaffold-add-word-bank",
              params: { supportLevel: "low" },
              reason: "This question depends on recalling several topic words.",
              targetBlockId: questionId,
            },
          ],
        }),
        prepare,
      }),
    ).resolves.toEqual([
      {
        kind: "scaffold-add-word-bank",
        label: "Add a word bank",
        params: { supportLevel: "low" },
        reason: "This question depends on recalling several topic words.",
        targetBlockId: questionId,
      },
    ]);
  });

  it("drops a suggestion for a target the transformation cannot change", async () => {
    await expect(
      generateSuggestions(worksheetScaffoldingSuggestionFlow, worksheet, [], {
        invoker: invokerWith({
          suggestions: [
            {
              kind: "scaffold-add-word-bank",
              params: { supportLevel: "low" },
              reason: "Add vocabulary support.",
              targetBlockId: paragraphId,
            },
          ],
        }),
        prepare,
      }),
    ).resolves.toEqual([]);
  });

  it("keeps the usable suggestions when one of them is unavailable", async () => {
    await expect(
      generateSuggestions(worksheetScaffoldingSuggestionFlow, worksheet, [], {
        invoker: invokerWith({
          suggestions: [
            {
              kind: "scaffold-add-word-bank",
              params: { supportLevel: "low" },
              reason: "Add vocabulary support.",
              targetBlockId: paragraphId,
            },
            {
              kind: "scaffold-add-word-bank",
              params: { supportLevel: "low" },
              reason: "This question depends on recalling several topic words.",
              targetBlockId: questionId,
            },
          ],
        }),
        prepare,
      }),
    ).resolves.toMatchObject([{ targetBlockId: questionId }]);
  });

  it("keeps the first of two offers of the same change for one target", async () => {
    const suggestion = {
      kind: "scaffold-add-word-bank",
      params: { supportLevel: "low" },
      targetBlockId: questionId,
    };

    await expect(
      generateSuggestions(worksheetScaffoldingSuggestionFlow, worksheet, [], {
        invoker: invokerWith({
          suggestions: [
            { ...suggestion, reason: "The first reason." },
            { ...suggestion, reason: "The second reason." },
          ],
        }),
        prepare,
      }),
    ).resolves.toMatchObject([{ reason: "The first reason." }]);
  });

  it("drops an already-used target even if an invoker bypasses its target enum", async () => {
    await expect(
      generateSuggestions(
        worksheetScaffoldingSuggestionFlow,
        worksheet,
        [
          {
            kind: "scaffold-add-word-bank",
            params: { supportLevel: "low" },
            targetBlockId: questionId,
          },
        ],
        {
          invoker: invokerWith({
            suggestions: [
              {
                kind: "scaffold-add-word-bank",
                params: { supportLevel: "low" },
                reason: "Supply the words needed for this question.",
                targetBlockId: questionId,
              },
            ],
          }),
          prepare,
        },
      ),
    ).resolves.toEqual([]);
  });

  it("returns no suggestions without invoking the model when every target is used", async () => {
    const invoker = invokerWith({ suggestions: [] });
    const appliedTransformations = [
      {
        kind: "scaffold-add-prompt-questions",
        params: { supportLevel: "low" },
      },
      ...questionIds.flatMap((targetBlockId) =>
        ["scaffold-add-word-bank", "scaffold-chunk-tasks"].map((kind) => ({
          kind,
          params: { supportLevel: "low" },
          targetBlockId,
        })),
      ),
    ];

    await expect(
      generateSuggestions(
        worksheetScaffoldingSuggestionFlow,
        worksheet,
        appliedTransformations,
        { invoker, prepare },
      ),
    ).resolves.toEqual([]);
    expect(invoker.invokeStructured).not.toHaveBeenCalled();
  });

  it("allows the agent to recommend no changes", async () => {
    await expect(
      generateSuggestions(worksheetScaffoldingSuggestionFlow, worksheet, [], {
        invoker: invokerWith({ suggestions: [] }),
        prepare,
      }),
    ).resolves.toEqual([]);
  });

  it("does not mistake an unsuccessful model response for no suggestions", async () => {
    await expect(
      generateSuggestions(worksheetScaffoldingSuggestionFlow, worksheet, [], {
        invoker: invokerWithOutcome("OUTPUT_MISSING"),
        prepare,
      }),
    ).rejects.toThrow("Suggestion generation ended with OUTPUT_MISSING");
  });
});
