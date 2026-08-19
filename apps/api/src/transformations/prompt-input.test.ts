import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import { defineTransformation } from "./define-transformation";
import {
  serialiseResourceDocumentForPrompt,
  serialiseResourceNodeForPrompt,
  transformationPromptVariables,
} from "./prompt-input";
import { always } from "./availability";
import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

let worksheet: ResourceDocument;
let question: QuestionNode;

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
  });
  const firstQuestion = worksheet.content.find(
    (node): node is QuestionNode => node.type === "question",
  );
  if (firstQuestion === undefined) {
    throw new Error("The fixture has no question.");
  }
  question = firstQuestion;
});

describe("transformation prompt input", () => {
  it("serialises a document as stable semantic text rather than storage JSON", () => {
    const input = serialiseResourceDocumentForPrompt(worksheet);

    expect(input).toContain("PUPIL RESOURCE");
    expect(input).toContain(`<question id="${question.id}">`);
    expect(input).not.toContain('"schemaVersion"');
    expect(input).not.toContain('"children"');
  });

  it("serialises just the selected node for the block placeholder", () => {
    const input = serialiseResourceNodeForPrompt(question);

    expect(input).toContain(`<question id="${question.id}">`);
    expect(input).not.toContain("PUPIL RESOURCE");
  });
});

describe("serialising a document a transformation has already changed", () => {
  it("shows a scaffold a later transformation must read", () => {
    const scaffolded = {
      ...worksheet,
      content: [
        ...worksheet.content,
        {
          id: "contribution-1-vocabulary",
          type: "definitionList" as const,
          lead: [{ type: "text" as const, text: "Words you could use:" }],
          entries: [
            {
              term: [{ type: "text" as const, text: "perspective" }],
              definition: [
                { type: "text" as const, text: "whose eyes we see through" },
              ],
              source: "oak-lesson" as const,
            },
          ],
        },
      ],
    };

    const input = serialiseResourceDocumentForPrompt(scaffolded);

    expect(input).toContain('<definitionList id="contribution-1-vocabulary">');
    expect(input).toContain("- perspective: whose eyes we see through");
  });

  it("includes the teacher's answers, which a word bank reads", () => {
    const answered = {
      ...worksheet,
      answers: [
        {
          id: "answer-1",
          targetId: question.id,
          placement: "append" as const,
          content: [
            {
              id: "answer-1-text",
              type: "paragraph" as const,
              content: [{ type: "text" as const, text: "A narrow perspective." }],
            },
          ],
        },
      ],
    };

    const input = serialiseResourceDocumentForPrompt(answered);

    expect(input).toContain("TEACHER ANSWERS");
    expect(input).toContain("A narrow perspective.");
  });
});

describe("transformationPromptVariables", () => {
  const definition = defineTransformation({
    kind: "test-serialisation",
    label: "Serialisation",
    status: "draft",
    target: { scope: "document" },
    outputs: ["revised-resource"],
    isAvailable: always,
    execution: {
      strategy: "deterministic",
      apply: (document) => [document],
    },
  });

  it("refuses a placeholder this request cannot fill", () => {
    expect(() =>
      transformationPromptVariables(
        definition,
        worksheet,
        {},
        {},
        undefined,
        "Support {{block}}.",
      ),
    ).toThrow(/asks for \{\{block\}\}/);
  });

  it("refuses lesson material a definition never declared", () => {
    expect(() =>
      transformationPromptVariables(
        definition,
        worksheet,
        {},
        {},
        undefined,
        "Use {{lessonMaterial}}.",
      ),
    ).toThrow(/asks for \{\{lessonMaterial\}\}/);
  });
});
