import { describe, expect, it } from "vitest";

import {
  parseResourceDocument,
  parseResourceDocumentJson,
  safeParseResourceDocument,
} from "./parse.js";

function genericDocument() {
  return {
    schemaVersion: "0.1",
    id: "generic-document",
    profile: "generic.v0",
    language: "en-GB",
    metadata: { title: "A generic document" },
    content: [
      {
        id: "paragraph-1",
        type: "paragraph",
        content: [{ type: "text", text: "Hello" }],
      },
    ],
    answers: [],
    assets: [],
    provenance: {
      source: { system: "test", id: "generic-1" },
      producer: { name: "test", version: "1" },
    },
    diagnostics: [],
  };
}

describe("resource document parsing", () => {
  it("parses a strict generic document and JSON string", () => {
    const input = genericDocument();
    expect(parseResourceDocument(input)).toEqual(input);
    expect(parseResourceDocumentJson(JSON.stringify(input))).toEqual(input);
  });

  it.each([
    [{}, "missing_schema_version"],
    [{ schemaVersion: 0.1 }, "invalid_schema_version"],
    [{ schemaVersion: "v1" }, "invalid_schema_version"],
    [{ schemaVersion: "0.2" }, "unsupported_schema_version"],
  ])("classifies version input %#", (input, code) => {
    const result = safeParseResourceDocument(input);
    expect(result).toMatchObject({ success: false, error: { code } });
  });

  it("rejects unknown keys rather than stripping them", () => {
    const result = safeParseResourceDocument({
      ...genericDocument(),
      unexpected: true,
    });
    expect(result).toMatchObject({
      success: false,
      error: { code: "invalid_document" },
    });
  });

  it("rejects duplicate IDs as an invariant violation", () => {
    const input = genericDocument();
    input.content.push({
      id: "paragraph-1",
      type: "paragraph",
      content: [{ type: "text", text: "Duplicate" }],
    });

    const result = safeParseResourceDocument(input);
    expect(result).toMatchObject({
      success: false,
      error: {
        code: "invariant_violation",
        context: { invariantIssues: [{ code: "duplicate_id" }] },
      },
    });
  });

  it("requires answers to target the pupil content tree", () => {
    const input = genericDocument();
    Object.assign(input, {
      answers: [
        {
          id: "answer-1",
          targetId: "answer-content",
          placement: "append",
          content: [
            {
              id: "answer-content",
              type: "paragraph",
              content: [{ type: "text", text: "An answer" }],
            },
          ],
        },
      ],
    });

    const result = safeParseResourceDocument(input);
    expect(result).toMatchObject({
      success: false,
      error: {
        code: "invariant_violation",
        context: { invariantIssues: [{ code: "dangling_answer_target" }] },
      },
    });
  });

  it("accepts a worksheet that has no questions yet", () => {
    const input = {
      ...genericDocument(),
      profile: "worksheet.v0",
      metadata: { title: "Instructions only" },
    };

    expect(safeParseResourceDocument(input)).toMatchObject({ success: true });
  });

  it("classifies invalid JSON without exposing its contents", () => {
    expect(() => parseResourceDocumentJson("{oops")).toThrow(
      expect.objectContaining({ code: "invalid_json", context: {} }),
    );
  });
});
