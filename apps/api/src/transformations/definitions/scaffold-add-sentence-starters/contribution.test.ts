import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

import type { ContributionContext } from "../../contributions/contribution";
import { sentenceStartersContribution } from "./contribution";

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
    contributionId: "starters-1",
    document: worksheet,
    material: {},
    params: {},
    targetNode: question,
    transformationKind: "scaffold-add-sentence-starters",
  };
}

function addedSection(document: ResourceDocument) {
  const transformed = document.content.find(
    (node): node is QuestionNode => node.id === question.id,
  );
  return transformed?.children.find((node) => node.id === "starters-1-lines");
}

describe("sentenceStartersContribution", () => {
  it("places the starters beneath the task, behind a lead", () => {
    const prepared = sentenceStartersContribution.prepare(context());
    const [document] = prepared.apply({
      lines: ["When the water is heated, the particles…"],
    });

    expect(prepared.name).toBe("sentence_starters");
    expect(addedSection(document)).toMatchObject({
      type: "section",
      children: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "You could begin your answer like this:" }],
        },
        {
          id: "starters-1-line-1",
          type: "paragraph",
          content: [{ type: "text", text: "When the water is heated, the particles…" }],
        },
      ],
    });
  });

  it("refuses an empty set and more starters than a task needs", () => {
    const { schema } = sentenceStartersContribution.prepare(context());

    expect(schema.safeParse({ lines: [] }).success).toBe(false);
    expect(schema.safeParse({ lines: ["a", "b", "c", "d", "e"] }).success).toBe(false);
  });
});
