import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

import type { ContributionContext } from "../../contributions/contribution";
import { taskVocabularyContribution } from "./contribution";

let worksheet: ResourceDocument;
let question: QuestionNode;

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
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

function context(): ContributionContext {
  return {
    contributionId: "task-vocabulary-1",
    document: worksheet,
    material: {
      "lesson.keywords": {
        kind: "keywords",
        keywords: [
          { keyword: "perspective", description: "the position a story is told from" },
        ],
      },
    },
    params: {},
    targetNode: question,
    transformationKind: "scaffold-add-task-vocabulary",
  };
}

function addedEntries(document: ResourceDocument) {
  const transformed = document.content.find(
    (node): node is QuestionNode => node.id === question.id,
  );
  const list = transformed?.children.find((node) => node.type === "definitionList");
  return list?.type === "definitionList" ? list.entries : [];
}

describe("taskVocabularyContribution", () => {
  it("defines the task's words beneath it, preferring Oak's own wording", () => {
    const prepared = taskVocabularyContribution.prepare(context());
    const [document] = prepared.apply({
      entries: [{ definition: "the model's wording", term: "perspective" }],
    });

    expect(prepared.name).toBe("task_vocabulary");
    expect(addedEntries(document)).toEqual([
      {
        definition: [{ type: "text", text: "the position a story is told from" }],
        source: "oak-lesson",
        term: [{ type: "text", text: "perspective" }],
      },
    ]);
  });

  it("refuses a fourth word, beyond which the task has become a reading task", () => {
    const { schema } = taskVocabularyContribution.prepare(context());
    const entry = (term: string) => ({ definition: "a meaning", term });

    expect(schema.safeParse({ entries: ["a", "b", "c"].map(entry) }).success).toBe(
      true,
    );
    expect(schema.safeParse({ entries: ["a", "b", "c", "d"].map(entry) }).success).toBe(
      false,
    );
  });

  it("requires a definition for every word", () => {
    const { schema } = taskVocabularyContribution.prepare(context());

    expect(schema.safeParse({ entries: [{ term: "perspective" }] }).success).toBe(
      false,
    );
  });
});
