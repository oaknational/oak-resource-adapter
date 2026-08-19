import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

import type { ContributionContext } from "../../contributions/contribution";
import { wordBankContribution } from "./contribution";

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

function context(supportLevel: "high" | "low" | "mid"): ContributionContext {
  return {
    contributionId: `word-bank-${supportLevel}`,
    document: worksheet,
    material: {
      "lesson.keywords": {
        kind: "keywords",
        keywords: [
          { keyword: "perspective", description: "the position a story is told from" },
        ],
      },
    },
    params: { supportLevel },
    supportLevel,
    targetNode: question,
    transformationKind: "scaffold-add-word-bank",
  };
}

function addedEntries(document: ResourceDocument) {
  const transformedQuestion = document.content.find(
    (node): node is QuestionNode => node.id === question.id,
  );
  const list = transformedQuestion?.children.find(
    (node) => node.type === "definitionList",
  );
  return list?.type === "definitionList" ? list.entries : [];
}

describe("wordBankContribution", () => {
  it("uses a words-only schema and document shape for low support", () => {
    const prepared = wordBankContribution.prepare(context("low"));
    const output = { entries: [{ term: "perspective" }] };

    expect(prepared.name).toBe("word_bank_low");
    expect(prepared.schema.safeParse(output).success).toBe(true);
    expect(
      prepared.schema.safeParse({
        entries: [{ definition: "not requested", term: "perspective" }],
      }).success,
    ).toBe(false);
    expect(addedEntries(prepared.apply(output)[0])).toEqual([
      { term: [{ type: "text", text: "perspective" }], source: "oak-lesson" },
    ]);
  });

  it("uses Oak's definition for mid support when the term is a lesson keyword", () => {
    const prepared = wordBankContribution.prepare(context("mid"));
    const [document] = prepared.apply({
      entries: [{ definition: "the model's wording", term: "Perspective" }],
    });

    expect(prepared.name).toBe("word_bank_mid");
    expect(addedEntries(document)).toEqual([
      {
        definition: [{ type: "text", text: "the position a story is told from" }],
        source: "oak-lesson",
        term: [{ type: "text", text: "Perspective" }],
      },
    ]);
  });

  it("requires and preserves an example for high support", () => {
    const prepared = wordBankContribution.prepare(context("high"));
    const output = {
      entries: [
        {
          definition: "a point of view",
          example: "The two narrators offer different perspectives.",
          term: "perspective",
        },
      ],
    };

    expect(
      prepared.schema.safeParse({
        entries: [{ definition: "a point of view", term: "perspective" }],
      }).success,
    ).toBe(false);
    expect(addedEntries(prepared.apply(output)[0])[0]).toMatchObject({
      example: [
        {
          type: "text",
          text: "The two narrators offer different perspectives.",
        },
      ],
    });
  });
});
