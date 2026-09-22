import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

import type { ContributionContext } from "../../contributions/contribution";
import { sentenceFramesContribution } from "./contribution";

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
    contributionId: "frames-1",
    document: worksheet,
    material: {},
    params: {},
    targetNode: question,
    transformationKind: "scaffold-add-sentence-frames",
  };
}

describe("sentenceFramesContribution", () => {
  it("introduces the frames as the shape of an answer", () => {
    const prepared = sentenceFramesContribution.prepare(context());
    const [document] = prepared.apply({
      lines: ["I think that … because … which means that …"],
    });
    const transformed = document.content.find(
      (node): node is QuestionNode => node.id === question.id,
    );

    expect(prepared.name).toBe("sentence_frames");
    expect(
      transformed?.children.find((node) => node.id === "frames-1-lines"),
    ).toMatchObject({
      type: "section",
      children: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "You could shape your answer like this:" }],
        },
        {
          id: "frames-1-line-1",
          type: "paragraph",
          content: [
            { type: "text", text: "I think that … because … which means that …" },
          ],
        },
      ],
    });
  });
});
