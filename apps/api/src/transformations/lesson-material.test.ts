import { definePromptTemplate } from "@oaknational/resource-adapter-ai";
import {
  buildLesson,
  createInMemoryLessonRepository,
} from "@oaknational/resource-adapter-curriculum";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StructuredModelOutputResult } from "@oaknational/resource-adapter-ai";
import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

import type { ResourceAdapterModelInvoker } from "../ai/model-roles";
import { resolveLessonMaterial } from "../oak-material/from-lesson";
import { always } from "./availability";
import { defineTransformation } from "./define-transformation";

import {
  executeTransformation,
  prepareTransformation,
  type PreparePrompt,
} from "./execute";
import { addWordBankTransformation } from "./definitions/scaffold-add-word-bank";

const identity = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
};

const lessons = createInMemoryLessonRepository([
  buildLesson({
    identity,
    keywords: [
      { keyword: "perspective", description: "the position a story is told from" },
    ],
  }),
]);

const meta = { invocationId: "11111111-1111-1111-1111-111111111111" };

const cycleTitlesScaffold = defineTransformation({
  kind: "test-learning-cycle-titles",
  label: "Learning cycle titles",
  status: "draft",
  suggestion: { description: "Test", useWhen: "Test", avoidWhen: "Test" },
  materialRequirements: [
    { key: "lesson.transcriptSummary.learningCycleTitles", required: false },
  ],
  target: { scope: "document" },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: definePromptTemplate({
      identifier: "test-learning-cycle-titles",
      template: "Revise {{document}}, given {{lessonMaterial}}.",
    }),
  },
});

let worksheet: ResourceDocument;
let firstQuestion: QuestionNode;

const prepare = vi.fn<PreparePrompt>(({ template, variables }) =>
  Promise.resolve({
    promptTemplateId: `template-${template.identifier}`,
    text: Object.entries(variables)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n"),
  }),
);

function invokerReturning(output: unknown) {
  const structured: StructuredModelOutputResult<unknown> = {
    meta,
    outcome: "SUCCESS",
    output,
  };

  return {
    invoke: vi.fn(),
    invokeStructured: vi.fn(() => Promise.resolve(structured)),
    invokeText: vi.fn(),
  } as unknown as ResourceAdapterModelInvoker;
}

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    ...identity,
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

describe("resolveLessonMaterial", () => {
  it("reads only the parts a transformation declared", async () => {
    await expect(
      resolveLessonMaterial(identity, lessons, [
        { key: "lesson.keywords", required: false },
      ]),
    ).resolves.toEqual({
      material: {
        "lesson.keywords": {
          kind: "keywords",
          keywords: [
            {
              keyword: "perspective",
              description: "the position a story is told from",
            },
          ],
        },
      },
      omissions: {},
    });
  });

  it("fetches nothing for a transformation that declares no material", async () => {
    await expect(resolveLessonMaterial(identity, lessons, [])).resolves.toEqual({
      material: {},
      omissions: {},
    });
  });

  it("warns rather than failing when an optional part is unavailable", async () => {
    const resolution = await resolveLessonMaterial(identity, lessons, [
      { key: "lesson.slides", required: false },
    ]);

    expect(resolution.material).toEqual({});
    expect(resolution.omissions["lesson.slides"]).toContain(
      "Lesson slides is not available",
    );
  });
});

describe("a lesson's transcript summary reaching a transformation", () => {
  it("offers the prompt the cycle titles rather than the teaching behind them", async () => {
    const lessonsWithTranscript = createInMemoryLessonRepository([
      buildLesson({
        identity,
        transcript: "The teacher explains how perspective changes a story.",
      }),
    ]);

    const { material } = await resolveLessonMaterial(
      identity,
      lessonsWithTranscript,
      cycleTitlesScaffold.materialRequirements ?? [],
      {
        summariseTranscript: () =>
          Promise.resolve({
            learningCycles: [
              {
                title: "Changing perspective",
                cycleOutcome: "Explain how perspective changes a story",
                explanation: ["Perspective changes whose experience a story presents."],
                checksForUnderstanding: [],
                practiceTask: null,
                feedback: null,
              },
            ],
            unassignedTranscriptContent: [],
          }),
      },
    );

    const { preparedPrompt } = await prepareTransformation(
      cycleTitlesScaffold,
      { document: worksheet, material },
      { prepare },
    );

    expect(preparedPrompt?.text).toContain("LEARNING CYCLE TITLES");
    expect(preparedPrompt?.text).toContain("- Cycle 1: Changing perspective");
    expect(preparedPrompt?.text).not.toContain(
      "Perspective changes whose experience a story presents.",
    );
  });
});

describe("a lesson's keywords reaching a transformation", () => {
  it("offers them to the prompt and takes Oak's definition over the model's", async () => {
    const { material } = await resolveLessonMaterial(
      identity,
      lessons,
      addWordBankTransformation.materialRequirements ?? [],
    );
    const invoker = invokerReturning({
      entries: [{ definition: "the model's own attempt", term: "perspective" }],
    });

    const run = await executeTransformation(
      addWordBankTransformation,
      {
        contributionId: "contribution-1",
        document: worksheet,
        material,
        params: { supportLevel: "mid" },
        targetBlockId: firstQuestion.id,
      },
      { createInvoker: () => invoker, prepare },
    );

    const [call] = prepare.mock.calls.slice(-1);

    expect(call?.[0].variables["lessonMaterial"]).toContain(
      "- perspective: the position a story is told from",
    );

    const scaffold =
      run.outcome === "APPLIED"
        ? run.outputs[0].document.content
            .flatMap((node) => (node.type === "question" ? node.children : []))
            .find((node) => node.id === "contribution-1-vocabulary")
        : undefined;

    expect(scaffold).toMatchObject({
      entries: [
        {
          term: [{ type: "text", text: "perspective" }],
          definition: [{ type: "text", text: "the position a story is told from" }],
          source: "oak-lesson",
        },
      ],
    });
  });
});
