import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  QuestionNode,
  ResourceDocument,
  SectionNode,
} from "@oaknational/resource-document";

import type { ContributionContext } from "../../contributions/contribution";
import { chunkTasksContribution } from "./contribution";

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

function context(document: ResourceDocument = worksheet): ContributionContext {
  return {
    contributionId: "chunk-tasks-1",
    document,
    material: {},
    params: { supportLevel: "low" },
    supportLevel: "low",
    targetNode: question,
    transformationKind: "scaffold-chunk-tasks",
  };
}

function withKeyStage(id: string, label: string): ResourceDocument {
  if (worksheet.profile !== "worksheet.v0") {
    throw new Error("The fixture is not a worksheet.");
  }

  return {
    ...worksheet,
    metadata: { ...worksheet.metadata, keyStage: { id, label } },
  };
}

describe("chunkTasksContribution", () => {
  it.each(["ks1", "ks2"])("requires two or three steps at %s", (keyStage) => {
    const document = withKeyStage(keyStage, keyStage.toUpperCase());
    const { schema } = chunkTasksContribution.prepare(context(document));

    expect(schema.safeParse({ steps: ["First", "Second"] }).success).toBe(true);
    expect(schema.safeParse({ steps: ["Only one"] }).success).toBe(false);
    expect(schema.safeParse({ steps: ["One", "Two", "Three", "Four"] }).success).toBe(
      false,
    );
  });

  it.each(["ks3", "ks4"])("requires between three and five steps at %s", (keyStage) => {
    const document = withKeyStage(keyStage, keyStage.toUpperCase());
    const { schema } = chunkTasksContribution.prepare(context(document));

    expect(schema.safeParse({ steps: ["One", "Two", "Three"] }).success).toBe(true);
    expect(schema.safeParse({ steps: ["One", "Two"] }).success).toBe(false);
    expect(
      schema.safeParse({
        steps: ["One", "Two", "Three", "Four", "Five", "Six"],
      }).success,
    ).toBe(false);
  });

  it("rejects a step containing only a number", () => {
    const { schema } = chunkTasksContribution.prepare(context());

    expect(schema.safeParse({ steps: ["1.", "2. Write the scene"] }).success).toBe(
      false,
    );
  });

  it("places attributed numbered steps beneath the task before its response space", () => {
    const prepared = chunkTasksContribution.prepare(context());
    const output = prepared.schema.parse({
      steps: ["1. Plan the scene", "Step 2: Write the scene"],
    });
    const [document] = prepared.apply(output);
    const transformedQuestion = document.content.find(
      (node): node is QuestionNode => node.id === question.id,
    );
    const section = transformedQuestion?.children.find(
      (node): node is SectionNode => node.type === "section",
    );
    const responseSpace = transformedQuestion?.children.findIndex(
      (node) => node.type === "responseSpace",
    );

    expect(prepared.name).toBe("chunk_tasks_2_3");
    expect(section).toMatchObject({
      id: "chunk-tasks-1-chunked-steps",
      extensions: {
        "oak:contribution": "chunk-tasks-1",
        "oak:transformation-kind": "scaffold-chunk-tasks",
      },
      children: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Step 1: Plan the scene" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Step 2: Write the scene" }],
        },
      ],
    });
    expect(transformedQuestion?.children.indexOf(section as SectionNode)).toBeLessThan(
      responseSpace ?? -1,
    );
  });
});
