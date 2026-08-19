import { definePromptTemplate } from "@oaknational/resource-adapter-ai";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type {
  StructuredModelOutputResult,
  TextModelOutputResult,
} from "@oaknational/resource-adapter-ai";
import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

import type { ResourceAdapterModelInvoker } from "../ai/model-roles";
import { always } from "./availability";
import { glossaryContribution } from "./definitions/scaffold-add-glossary-question/contribution";
import { defineTransformation } from "./define-transformation";
import { executeTransformation, type PreparePrompt } from "./execute";

let worksheet: ResourceDocument;
let firstQuestion: QuestionNode;

const meta = { invocationId: "11111111-1111-1111-1111-111111111111" };

const modelText: TextModelOutputResult = {
  meta,
  outcome: "SUCCESS",
  output: "some words",
};

const prepare = vi.fn<PreparePrompt>(({ template, variables }) =>
  Promise.resolve({
    promptTemplateId: `template-${template.identifier}`,
    text: Object.entries(variables)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n"),
  }),
);

function fakeInvoker(
  responses: Readonly<{
    structured?: StructuredModelOutputResult<unknown>;
    text?: TextModelOutputResult;
  }>,
) {
  const invokeText = vi.fn(() => Promise.resolve(responses.text ?? modelText));
  const invokeStructured = vi.fn(() => Promise.resolve(responses.structured));

  return {
    invokeStructured,
    invokeText,
    invoker: {
      invoke: vi.fn(),
      invokeStructured,
      invokeText,
    } as unknown as ResourceAdapterModelInvoker,
  };
}

const identity = defineTransformation({
  kind: "test-identity",
  label: "Identity",
  status: "draft",
  target: { scope: "document" },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: { strategy: "deterministic", apply: (document) => [document] },
});

const blockScaffold = defineTransformation({
  kind: "test-block-scaffold",
  label: "Block scaffold",
  supportLevels: [
    { level: "low", description: "Names the words." },
    { level: "mid", description: "Defines the words." },
  ],
  status: "draft",
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: definePromptTemplate({
      identifier: "test-block-scaffold",
      template: "Support {{block}} at {{supportLevel}} within {{document}}.",
      version: 1,
    }),
  },
});

const contextHungry = defineTransformation({
  kind: "test-context-hungry",
  label: "Context hungry",
  status: "draft",
  target: { scope: "document" },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: definePromptTemplate({
      identifier: "test-context-hungry",
      template: "Use {{lessonContext}} against {{document}}.",
      version: 1,
    }),
  },
});

const vocabularyScaffold = defineTransformation({
  kind: "test-vocabulary-scaffold",
  label: "Vocabulary scaffold",
  status: "draft",
  materialRequirements: [{ key: "lesson.keywords", required: false }],
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: definePromptTemplate({
      identifier: "test-vocabulary-scaffold",
      template: "Define words in {{block}} of {{document}}, given {{lessonMaterial}}.",
      version: 1,
    }),
  },
});

const withContribution = {
  ...vocabularyScaffold,
  execution: {
    ...vocabularyScaffold.execution,
    contribution: glossaryContribution,
  },
} as typeof vocabularyScaffold;

function structuredSuccess(
  entries: ReadonlyArray<{ definition: string; term: string }>,
): StructuredModelOutputResult<unknown> {
  return { meta, outcome: "SUCCESS", output: { entries } };
}

function appliedDocument(run: Awaited<ReturnType<typeof executeTransformation>>) {
  if (run.outcome !== "APPLIED") {
    throw new Error(`Expected APPLIED, got ${run.outcome}.`);
  }
  return run.outputs[0].document;
}

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
  });
  const [question] = worksheet.content.filter(
    (node): node is QuestionNode => node.type === "question",
  );

  if (question === undefined) {
    throw new Error("The worksheet fixture no longer has a top-level question.");
  }

  firstQuestion = question;
});

describe("executeTransformation", () => {
  it("applies a deterministic kind without reaching a model", async () => {
    const { invoker, invokeText } = fakeInvoker({});

    await expect(
      executeTransformation(identity, { document: worksheet }, { invoker }),
    ).resolves.toEqual({
      outcome: "APPLIED",
      outputs: [{ document: worksheet, purpose: "revised-resource" }],
    });
    expect(invokeText).not.toHaveBeenCalled();
  });

  it("does not create a model invoker for a deterministic kind", async () => {
    const createInvoker = vi.fn(() => fakeInvoker({}).invoker);

    await executeTransformation(identity, { document: worksheet }, { createInvoker });

    expect(createInvoker).not.toHaveBeenCalled();
  });

  it("returns the model's text for a kind with no contribution yet", async () => {
    const { invoker, invokeText } = fakeInvoker({});

    await expect(
      executeTransformation(
        blockScaffold,
        {
          document: worksheet,
          params: { supportLevel: "mid" },
          targetBlockId: firstQuestion.id,
        },
        { invoker, prepare },
      ),
    ).resolves.toEqual({ meta, outcome: "TEXT", text: "some words" });

    expect(invokeText).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTemplateId: "template-test-block-scaffold",
        role: "worksheet-scaffold",
      }),
    );
  });

  it("gives the prompt only the placeholders it declares", async () => {
    const { invoker } = fakeInvoker({});

    await executeTransformation(
      blockScaffold,
      {
        document: worksheet,
        params: { supportLevel: "low" },
        targetBlockId: firstQuestion.id,
      },
      { invoker, prepare },
    );

    const [call] = prepare.mock.calls.slice(-1);

    expect(Object.keys(call?.[0].variables ?? {}).sort()).toEqual([
      "block",
      "document",
      "supportLevel",
    ]);
    expect(call?.[0].variables["supportLevel"]).toBe("low");
  });

  it("reports a model response it cannot use", async () => {
    const { invoker } = fakeInvoker({
      text: { meta, outcome: "REFUSAL", refusal: "no" },
    });

    await expect(
      executeTransformation(
        blockScaffold,
        {
          document: worksheet,
          params: { supportLevel: "low" },
          targetBlockId: firstQuestion.id,
        },
        { invoker, prepare },
      ),
    ).resolves.toEqual({ meta, outcome: "UNUSABLE", reason: "REFUSAL" });
  });

  it("rejects params the kind does not declare", async () => {
    const { invoker } = fakeInvoker({});

    await expect(
      executeTransformation(
        blockScaffold,
        {
          document: worksheet,
          params: { supportLevel: "high" },
          targetBlockId: firstQuestion.id,
        },
        { invoker, prepare },
      ),
    ).rejects.toThrow();
  });

  it("refuses a node-targeted kind without a node", async () => {
    const { invoker } = fakeInvoker({});

    await expect(
      executeTransformation(
        blockScaffold,
        { document: worksheet, params: { supportLevel: "low" } },
        { invoker, prepare },
      ),
    ).rejects.toThrow(/needs the node/);
  });

  it("refuses a node this document does not contain", async () => {
    const { invoker } = fakeInvoker({});

    await expect(
      executeTransformation(
        blockScaffold,
        {
          document: worksheet,
          params: { supportLevel: "low" },
          targetBlockId: "not-a-block",
        },
        { invoker, prepare },
      ),
    ).rejects.toThrow(/does not contain/);
  });

  it("refuses an existing node of a type the definition cannot target", async () => {
    const { invoker } = fakeInvoker({});
    const paragraph = Array.from(
      (await import("@oaknational/resource-document")).walkResourceDocument(worksheet),
    ).find((node) => node.type === "paragraph");
    if (paragraph === undefined) {
      throw new Error("The fixture has no paragraph.");
    }

    await expect(
      executeTransformation(
        blockScaffold,
        {
          document: worksheet,
          params: { supportLevel: "low" },
          targetBlockId: paragraph.id,
        },
        { invoker, prepare },
      ),
    ).rejects.toThrow(/cannot target a paragraph/);
  });

  it("refuses a node for a kind that changes the whole document", async () => {
    const { invoker } = fakeInvoker({});

    await expect(
      executeTransformation(
        identity,
        { document: worksheet, targetBlockId: firstQuestion.id },
        { invoker },
      ),
    ).rejects.toThrow(/whole document/);
  });

  it("refuses to run a prompt whose material the request does not carry", async () => {
    const { invoker, invokeText } = fakeInvoker({});

    await expect(
      executeTransformation(
        contextHungry,
        { document: worksheet },
        { invoker, prepare },
      ),
    ).rejects.toThrow(/\{\{lessonContext\}\}/);
    expect(invokeText).not.toHaveBeenCalled();
  });
});

describe("executeTransformation with a contribution", () => {
  it("applies the model's output to the document beneath its target", async () => {
    const { invoker, invokeStructured } = fakeInvoker({
      structured: structuredSuccess([
        { definition: "a hard sedimentary rock", term: "limestone" },
      ]),
    });

    const run = await executeTransformation(
      withContribution,
      {
        contributionId: "contribution-1",
        document: worksheet,
        targetBlockId: firstQuestion.id,
      },
      { invoker, prepare },
    );

    expect(invokeStructured).toHaveBeenCalledWith(
      expect.objectContaining({ schemaName: "question_glossary" }),
    );
    expect(run).toMatchObject({ meta, outcome: "APPLIED" });

    const applied = appliedDocument(run)
      .content.filter((node): node is QuestionNode => node.type === "question")
      .flatMap((question) => question.children)
      .find((node) => node.id === "contribution-1-vocabulary");

    expect(applied).toMatchObject({
      type: "definitionList",
      lead: [
        {
          type: "text",
          text: "This vocabulary will help you unpick what the task is asking you to do:",
        },
      ],
      entries: [
        {
          term: [{ type: "text", text: "limestone" }],
          definition: [{ type: "text", text: "a hard sedimentary rock" }],
        },
      ],
      extensions: {
        "oak:contribution": "contribution-1",
        "oak:transformation-kind": "test-vocabulary-scaffold",
      },
    });
  });

  it("places the scaffold before the space a pupil writes in", async () => {
    const { invoker } = fakeInvoker({
      structured: structuredSuccess([{ definition: "a definition", term: "word" }]),
    });

    const run = await executeTransformation(
      withContribution,
      {
        contributionId: "contribution-2",
        document: worksheet,
        targetBlockId: firstQuestion.id,
      },
      { invoker, prepare },
    );

    const children =
      appliedDocument(run).content.find(
        (node): node is QuestionNode => node.id === firstQuestion.id,
      )?.children ?? [];
    const scaffold = children.findIndex(
      (node) => node.id === "contribution-2-vocabulary",
    );
    const responseSpace = children.findIndex((node) => node.type === "responseSpace");

    expect(scaffold).toBeGreaterThanOrEqual(0);
    if (responseSpace !== -1) {
      expect(scaffold).toBeLessThan(responseSpace);
    }
  });

  it("prefers Oak's definition of a word the lesson teaches", async () => {
    const { invoker } = fakeInvoker({
      structured: structuredSuccess([
        { definition: "the model's own attempt", term: "Perspective" },
      ]),
    });

    const run = await executeTransformation(
      withContribution,
      {
        contributionId: "contribution-3",
        document: worksheet,
        material: {
          "lesson.keywords": {
            kind: "keywords",
            keywords: [
              {
                description: "the position a narrator tells a story from",
                keyword: "perspective",
              },
            ],
          },
        },
        targetBlockId: firstQuestion.id,
      },
      { invoker, prepare },
    );

    const entry = appliedDocument(run)
      .content.flatMap((node) => (node.type === "question" ? node.children : []))
      .find((node) => node.id === "contribution-3-vocabulary");

    expect(entry).toMatchObject({
      entries: [
        {
          definition: [
            { type: "text", text: "the position a narrator tells a story from" },
          ],
        },
      ],
    });
  });

  it("reports structured output the schema rejected", async () => {
    const { invoker } = fakeInvoker({
      structured: {
        meta,
        outcome: "STRUCTURED_OUTPUT_FAILURE",
        reason: "SCHEMA_MISMATCH",
        issues: [],
      },
    });

    await expect(
      executeTransformation(
        withContribution,
        {
          contributionId: "contribution-4",
          document: worksheet,
          targetBlockId: firstQuestion.id,
        },
        { invoker, prepare },
      ),
    ).resolves.toEqual({
      meta,
      outcome: "UNUSABLE",
      reason: "STRUCTURED_OUTPUT_FAILURE",
    });
  });

  it("refuses to attribute a contribution without an ID", async () => {
    const { invoker } = fakeInvoker({
      structured: structuredSuccess([{ definition: "a definition", term: "word" }]),
    });

    await expect(
      executeTransformation(
        withContribution,
        { document: worksheet, targetBlockId: firstQuestion.id },
        { invoker, prepare },
      ),
    ).rejects.toThrow(/contribution ID/);
  });
});

describe("declared outputs", () => {
  it("rejects a kind that produces fewer documents than it declares", async () => {
    const { invoker } = fakeInvoker({});
    const twoOutputs = {
      ...identity,
      outputs: ["revised-resource", "companion-document"],
    } as typeof identity;

    await expect(
      executeTransformation(twoOutputs, { document: worksheet }, { invoker }),
    ).rejects.toThrow(/declares 2 output\(s\) but produced 1/);
  });

  it("pairs each document with the purpose its definition declared", async () => {
    const { invoker } = fakeInvoker({});
    const companion = {
      ...identity,
      outputs: ["companion-document"],
    } as typeof identity;

    const run = await executeTransformation(
      companion,
      { document: worksheet },
      { invoker },
    );

    expect(run.outcome === "APPLIED" ? run.outputs[0].purpose : undefined).toBe(
      "companion-document",
    );
  });
});
