import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import {
  getResourceNodeById,
  getResourceNodesByType,
  type ResourceDocument,
  type TaskNode,
} from "@oaknational/resource-document";

import type { ContributionContext } from "../../contributions/contribution";
import { promptQuestionsContribution } from "./contribution";

let worksheet: ResourceDocument;
let task: TaskNode;

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
  });
  const [first] = getResourceNodesByType(worksheet, "task");
  if (first === undefined) {
    throw new Error("The fixture has no task.");
  }
  task = first;
});

function context(): ContributionContext {
  return {
    contributionId: "prompt-questions-1",
    document: worksheet,
    material: {},
    params: {},
    targetNode: task,
    transformationKind: "scaffold-add-prompt-questions",
  };
}

describe("promptQuestionsContribution", () => {
  it("requires between one and ten non-empty questions", () => {
    const { schema } = promptQuestionsContribution.prepare(context());

    expect(schema.safeParse({ questions: ["What is perspective?"] }).success).toBe(
      true,
    );
    expect(schema.safeParse({ questions: [] }).success).toBe(false);
    expect(schema.safeParse({ questions: [" "] }).success).toBe(false);
    expect(
      schema.safeParse({
        questions: Array.from({ length: 11 }, (_, index) => `${index}?`),
      }).success,
    ).toBe(false);
  });

  it("starts the task with the fixed lead and attributed questions", () => {
    const prepared = promptQuestionsContribution.prepare(context());
    const [document] = prepared.apply({
      questions: ["What is perspective?", "Which tense should you use?"],
    });
    const revised = getResourceNodeById(document, task.id);
    if (revised?.type !== "task") {
      throw new Error("The task is missing.");
    }

    expect(prepared.name).toBe("prompt_questions");
    expect(revised.children[0]).toBe(task.children[0]);
    expect(revised.children.slice(2)).toEqual(task.children.slice(1));
    expect(revised.children[1]).toMatchObject({
      id: "prompt-questions-1-prompt-questions",
      type: "section",
      extensions: {
        "oak:contribution": "prompt-questions-1",
        "oak:transformation-kind": "scaffold-add-prompt-questions",
      },
      children: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Look back at the lesson so far and consider these questions:",
            },
          ],
        },
        {
          type: "question",
          label: "1",
          children: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "What is perspective?" }],
            },
          ],
        },
        {
          type: "question",
          label: "2",
          children: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Which tense should you use?" }],
            },
          ],
        },
      ],
    });
  });

  it("needs the task it supports", () => {
    expect(() =>
      promptQuestionsContribution.prepare({ ...context(), targetNode: undefined }),
    ).toThrow(/needs the task it supports/);
  });
});
