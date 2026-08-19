import { getResourceNodeById } from "@oaknational/resource-document";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  QuestionNode,
  ResourceDocument,
  ResourceNode,
} from "@oaknational/resource-document";

import { insertBeneath } from "./place";

let worksheet: ResourceDocument;
let question: QuestionNode;

const scaffold: ResourceNode = {
  id: "scaffold-1",
  type: "definitionList",
  entries: [{ term: [{ type: "text", text: "perspective" }] }],
};

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

describe("insertBeneath", () => {
  it("appends to the document when the change has no target", () => {
    const placed = insertBeneath(worksheet, scaffold, undefined);

    expect(placed.content.at(-1)).toBe(scaffold);
    expect(placed.content).toHaveLength(worksheet.content.length + 1);
  });

  it("leaves the document it was given untouched", () => {
    insertBeneath(worksheet, scaffold, question.id);

    expect(getResourceNodeById(worksheet, "scaffold-1")).toBeUndefined();
  });

  it("places the scaffold inside its target, before the space a pupil writes in", () => {
    const placed = insertBeneath(worksheet, scaffold, question.id);
    const children =
      placed.content.find((node): node is QuestionNode => node.id === question.id)
        ?.children ?? [];
    const responseSpace = children.findIndex((node) => node.type === "responseSpace");

    expect(children.indexOf(scaffold)).toBeGreaterThanOrEqual(0);
    expect(children.indexOf(scaffold)).toBeLessThan(responseSpace);
  });

  it("places it at the end of a target with nothing to write in", () => {
    const heading = {
      id: "heading-1",
      type: "heading" as const,
      level: 2,
      content: [{ type: "text" as const, text: "Task" }],
    };
    const document = {
      ...worksheet,
      content: [{ id: "section-1", type: "section" as const, children: [heading] }],
    };

    const placed = insertBeneath(document, scaffold, "section-1");
    const children =
      placed.content.find((node) => node.type === "section")?.type === "section"
        ? (placed.content[0] as { children: readonly ResourceNode[] }).children
        : [];

    expect(children.at(-1)).toBe(scaffold);
  });

  it("places it after a target that holds no children of its own", () => {
    const paragraph = {
      id: "paragraph-1",
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: "Read the extract." }],
    };
    const document = { ...worksheet, content: [paragraph, question] };

    const placed = insertBeneath(document, scaffold, "paragraph-1");

    expect(placed.content[1]).toBe(scaffold);
  });

  it("finds a target nested inside another node", () => {
    const document = {
      ...worksheet,
      content: [{ id: "section-1", type: "section" as const, children: [question] }],
    };

    const placed = insertBeneath(document, scaffold, question.id);

    expect(getResourceNodeById(placed, "scaffold-1")).toBe(scaffold);
    expect(placed.content).toHaveLength(1);
  });

  it("refuses a target the document does not contain", () => {
    expect(() => insertBeneath(worksheet, scaffold, "not-a-node")).toThrow(
      /not in the document's content/,
    );
  });
});
