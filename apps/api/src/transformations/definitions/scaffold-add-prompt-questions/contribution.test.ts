import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type { ResourceDocument, SectionNode } from "@oaknational/resource-document";

import type { ContributionContext } from "../../contributions/contribution";
import { promptQuestionsContribution } from "./contribution";

let worksheet: ResourceDocument;

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    lessonSlug: "adopting-different-perspectives",
    programmeSlug: "english-primary-ks2",
    resourceType: "worksheet",
  });
});

function context(document: ResourceDocument = worksheet): ContributionContext {
  return {
    contributionId: "prompt-questions-1",
    document,
    material: {},
    params: { supportLevel: "low" },
    supportLevel: "low",
    transformationKind: "scaffold-add-prompt-questions",
  };
}

describe("promptQuestionsContribution", () => {
  it("requires between one and three non-empty questions", () => {
    const { schema } = promptQuestionsContribution.prepare(context());

    expect(schema.safeParse({ questions: ["What is perspective?"] }).success).toBe(
      true,
    );
    expect(schema.safeParse({ questions: [] }).success).toBe(false);
    expect(schema.safeParse({ questions: [" "] }).success).toBe(false);
    expect(
      schema.safeParse({ questions: ["One?", "Two?", "Three?", "Four?"] }).success,
    ).toBe(false);
  });

  it("starts the added section with the fixed lead and attributed questions", () => {
    const prepared = promptQuestionsContribution.prepare(context());
    const [document] = prepared.apply({
      questions: ["What is perspective?", "Which tense should you use?"],
    });
    const section = document.content[1] as SectionNode;

    expect(prepared.name).toBe("prompt_questions");
    expect(document.content[0]).toBe(worksheet.content[0]);
    expect(document.content.slice(2)).toEqual(worksheet.content.slice(1));
    expect(section).toMatchObject({
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
    expect(worksheet.content).toHaveLength(document.content.length - 1);
  });

  it("uses the first position when the document has no leading title", () => {
    const withoutTitle = { ...worksheet, content: worksheet.content.slice(1) };
    const prepared = promptQuestionsContribution.prepare(context(withoutTitle));
    const [document] = prepared.apply({ questions: ["What is perspective?"] });

    expect(document.content[0]?.id).toBe("prompt-questions-1-prompt-questions");
    expect(document.content.slice(1)).toEqual(withoutTitle.content);
  });

  it("places support after a title when the document has no body yet", () => {
    const titleOnly = { ...worksheet, content: worksheet.content.slice(0, 1) };
    const prepared = promptQuestionsContribution.prepare(context(titleOnly));
    const [document] = prepared.apply({ questions: ["What is perspective?"] });

    expect(document.content[0]).toBe(titleOnly.content[0]);
    expect(document.content[1]?.id).toBe("prompt-questions-1-prompt-questions");
  });
});
