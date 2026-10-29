import { getResourceNodesByType } from "@oaknational/resource-document";
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
  const first = getResourceNodesByType(worksheet, "question")[0];
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
  const transformedQuestion = getResourceNodesByType(document, "question").find(
    (node) => node.id === question.id,
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

  it("lists the words alphabetically", () => {
    const prepared = wordBankContribution.prepare(context("low"));
    const [document] = prepared.apply({
      entries: [{ term: "narrator" }, { term: "Arctic" }, { term: "axis" }],
    });

    expect(addedEntries(document).map(({ term }) => term[0])).toEqual([
      { type: "text", text: "Arctic" },
      { type: "text", text: "axis" },
      { type: "text", text: "narrator" },
    ]);
  });

  it("refuses a level the definition no longer offers", () => {
    expect(() => wordBankContribution.prepare(context("high"))).toThrow(/high support/);
  });
});
