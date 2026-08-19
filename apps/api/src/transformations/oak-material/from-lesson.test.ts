import {
  buildLesson,
  createInMemoryLessonRepository,
} from "@oaknational/resource-adapter-curriculum";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StructuredModelOutputResult } from "@oaknational/resource-adapter-ai";
import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

import type { ResourceAdapterModelInvoker } from "../../ai/model-roles";
import { addGlossaryQuestionTransformation } from "../definitions/scaffold-add-glossary-question";
import { executeTransformation, type PreparePrompt } from "../execute";
import { resolveLessonMaterial } from "./from-lesson";

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
      warnings: [],
    });
  });

  it("fetches nothing for a transformation that declares no material", async () => {
    await expect(resolveLessonMaterial(identity, lessons, [])).resolves.toEqual({
      material: {},
      warnings: [],
    });
  });

  it("warns rather than failing when an optional part is unavailable", async () => {
    const resolution = await resolveLessonMaterial(identity, lessons, [
      { key: "lesson.slides", required: false },
    ]);

    expect(resolution.material).toEqual({});
    expect(resolution.warnings[0]).toContain("Lesson slides is not available");
  });
});

describe("a lesson's keywords reaching a transformation", () => {
  it("offers them to the prompt and takes Oak's definition over the model's", async () => {
    const { material } = await resolveLessonMaterial(
      identity,
      lessons,
      addGlossaryQuestionTransformation.materialRequirements ?? [],
    );
    const invoker = invokerReturning({
      entries: [{ definition: "the model's own attempt", term: "perspective" }],
    });

    const run = await executeTransformation(
      addGlossaryQuestionTransformation,
      {
        contributionId: "contribution-1",
        document: worksheet,
        material,
        params: { supportLevel: "low" },
        targetBlockId: firstQuestion.id,
      },
      { invoker, prepare },
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
