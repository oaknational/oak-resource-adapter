import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

import type { ContributionContext } from "../../contributions/contribution";
import { taskGlossaryContribution } from "./contribution";

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
    contributionId: "task-glossary-1",
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
    transformationKind: "scaffold-add-task-glossary",
  };
}

function addedEntries(document: ResourceDocument) {
  const transformed = document.content.find(
    (node): node is QuestionNode => node.id === question.id,
  );
  const list = transformed?.children.find((node) => node.type === "definitionList");
  return list?.type === "definitionList" ? list.entries : [];
}

describe("taskGlossaryContribution", () => {
  it("defines the task's words beneath it, preferring Oak's own wording", () => {
    const prepared = taskGlossaryContribution.prepare(context());
    const [document] = prepared.apply({
      entries: [{ definition: "the model's wording", term: "perspective" }],
    });

    expect(prepared.name).toBe("task_glossary");
    expect(addedEntries(document)).toEqual([
      {
        definition: [{ type: "text", text: "the position a story is told from" }],
        source: "oak-lesson",
        term: [{ type: "text", text: "perspective" }],
      },
    ]);
  });

  it("refuses an eleventh word", () => {
    const { schema } = taskGlossaryContribution.prepare(context());
    const entry = (term: string) => ({ definition: "a meaning", term });
    const terms = Array.from({ length: 11 }, (_, index) => `term ${index}`);

    expect(schema.safeParse({ entries: terms.slice(0, 10).map(entry) }).success).toBe(
      true,
    );
    expect(schema.safeParse({ entries: terms.map(entry) }).success).toBe(false);
  });

  it("requires a definition for every word", () => {
    const { schema } = taskGlossaryContribution.prepare(context());

    expect(schema.safeParse({ entries: [{ term: "perspective" }] }).success).toBe(
      false,
    );
  });
});
