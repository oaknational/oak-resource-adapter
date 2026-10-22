import { describe, expect, it } from "vitest";

import { resourceDocumentToPlainText } from "./plain-text.js";
import type {
  AnswerAnnotation,
  Asset,
  GenericDocument,
  ResourceNode,
  WorksheetDocument,
} from "./schema/types.js";

function worksheet(
  content: ResourceNode[],
  extras: Partial<Pick<WorksheetDocument, "answers" | "assets">> = {},
): WorksheetDocument {
  return {
    schemaVersion: "0.1",
    profile: "worksheet.v0",
    id: "plain-text",
    language: "en-GB",
    metadata: { title: "Linear equations" },
    content,
    answers: extras.answers ?? [],
    assets: extras.assets ?? [],
    provenance: {
      source: { system: "test", id: "plain-text" },
      producer: { name: "test", version: "1" },
    },
    diagnostics: [],
  };
}

function paragraph(id: string, text: string): ResourceNode {
  return { id, type: "paragraph", content: [{ type: "text", text }] };
}

function asset(id: string, alternative: Asset["alternative"]): Asset {
  return { id, mediaType: "image/png", contentRef: `${id}.png`, alternative };
}

describe("resourceDocumentToPlainText", () => {
  it("starts with the title and keeps reading order through nested nodes", () => {
    const document = worksheet([
      {
        id: "section",
        type: "section",
        children: [
          {
            id: "heading",
            type: "heading",
            level: 1,
            content: [{ type: "text", text: "Part A" }],
          },
          {
            id: "question",
            type: "question",
            label: "1",
            children: [paragraph("prompt", "Solve the equation.")],
          },
        ],
      },
    ]);

    expect(resourceDocumentToPlainText(document)).toBe(
      "Linear equations\nPart A\n1\nSolve the equation.",
    );
  });

  it("joins text and maths runs, keeping maths as written", () => {
    const document = worksheet([
      {
        id: "paragraph",
        type: "paragraph",
        content: [
          { type: "text", text: "Solve " },
          { type: "math", value: "2x + 3 = 7", display: false },
          { type: "text", text: " for x." },
        ],
      },
    ]);

    expect(resourceDocumentToPlainText(document)).toBe(
      "Linear equations\nSolve 2x + 3 = 7 for x.",
    );
  });

  it("emits callouts, definition lists, code blocks and unsupported content", () => {
    const document = worksheet([
      {
        id: "callout",
        type: "callout",
        role: "warning",
        content: [{ type: "text", text: "Wear goggles." }],
      },
      {
        id: "definitions",
        type: "definitionList",
        lead: [{ type: "text", text: "Key words" }],
        entries: [
          {
            term: [{ type: "text", text: "Coefficient" }],
            definition: [{ type: "text", text: "The number in front of a variable." }],
            example: [{ type: "text", text: "3 in 3x" }],
          },
          { term: [{ type: "text", text: "Constant" }] },
        ],
      },
      { id: "code", type: "codeBlock", language: "python", source: "print(2 + 2)" },
      {
        id: "unsupported",
        type: "unsupported",
        description: "A hand-drawn number line",
        accessibleText: "Number line from 0 to 10",
        original: { format: "svg", value: "<svg />" },
      },
      { id: "space", type: "responseSpace", kind: "lines", lines: 3 },
    ]);

    expect(resourceDocumentToPlainText(document).split("\n")).toEqual([
      "Linear equations",
      "Wear goggles.",
      "Key words",
      "Coefficient",
      "The number in front of a variable.",
      "3 in 3x",
      "Constant",
      "print(2 + 2)",
      "A hand-drawn number line",
      "Number line from 0 to 10",
    ]);
  });

  it("emits table content cells and skips answer and empty cells", () => {
    const document = worksheet([
      {
        id: "table",
        type: "table",
        role: "data",
        header: [
          { kind: "content", content: [{ type: "text", text: "x" }] },
          { kind: "content", content: [{ type: "text", text: "y" }] },
        ],
        rows: [
          [
            { kind: "content", content: [{ type: "text", text: "1" }] },
            { kind: "answer" },
          ],
          [
            { kind: "empty" },
            { kind: "content", content: [{ type: "text", text: "4" }] },
          ],
        ],
      },
    ]);

    expect(resourceDocumentToPlainText(document).split("\n")).toEqual([
      "Linear equations",
      "x",
      "y",
      "1",
      "4",
    ]);
  });

  it("emits figure captions and only text alternatives for their assets", () => {
    const document = worksheet(
      [
        {
          id: "figure-text",
          type: "figure",
          assetId: "graph",
          caption: [{ type: "text", text: "Figure 1" }],
        },
        { id: "figure-decorative", type: "figure", assetId: "border" },
        { id: "figure-missing", type: "figure", assetId: "photo" },
        { id: "figure-unknown", type: "figure", assetId: "not-in-assets" },
      ],
      {
        assets: [
          asset("graph", {
            kind: "text",
            text: "A straight line through (0, 3)",
            origin: "source",
          }),
          asset("border", { kind: "decorative" }),
          asset("photo", { kind: "missing" }),
        ],
      },
    );

    expect(resourceDocumentToPlainText(document).split("\n")).toEqual([
      "Linear equations",
      "Figure 1",
      "A straight line through (0, 3)",
    ]);
  });

  it("includes answer content after the main content unless told not to", () => {
    const answer: AnswerAnnotation = {
      id: "answer",
      targetId: "question",
      placement: "append",
      content: [paragraph("answer-text", "x = 2")],
    };
    const document = worksheet([paragraph("prompt", "Solve 2x + 3 = 7.")], {
      answers: [answer],
    });

    expect(resourceDocumentToPlainText(document)).toBe(
      "Linear equations\nSolve 2x + 3 = 7.\nx = 2",
    );
    expect(resourceDocumentToPlainText(document, { includeAnswerContent: false })).toBe(
      "Linear equations\nSolve 2x + 3 = 7.",
    );
  });

  it("leaves out the title when a generic document has none", () => {
    const document: GenericDocument = {
      ...worksheet([paragraph("prompt", "Notes")]),
      profile: "generic.v0",
      metadata: {},
    };

    expect(resourceDocumentToPlainText(document)).toBe("Notes");
  });
});
