import { describe, expect, it } from "vitest";

import { parseResourceMarkup, safeParseResourceMarkup } from "./parse.js";

const genericFrontmatter = [
  "---",
  'markup-version: "0.1"',
  'schema-version: "0.1"',
  'profile: "generic.v0"',
  'document-id: "example"',
  'language: "en-GB"',
  'source-system: "test"',
  'source-id: "example"',
  'producer: "test"',
  'producer-version: "1"',
  "---",
].join("\n");

describe("resource markup", () => {
  it("fails safely when directive attributes are malformed", () => {
    const result = safeParseResourceMarkup(
      `---\nmarkup-version: "0.1"\nschema-version: "0.1"\nprofile: "generic.v0"\ndocument-id: "bad"\nlanguage: "en-GB"\nsource-system: "test"\nsource-id: "bad"\nproducer: "test"\nproducer-version: "1"\n---\n\n:::oak-paragraph {id=no-quotes}\nBad\n:::\n`,
    );
    expect(result).toMatchObject({
      success: false,
      error: { code: "invalid_markup" },
    });
  });

  it("rejects incomplete in-place image metadata", () => {
    const result = safeParseResourceMarkup(
      `---\nmarkup-version: "0.1"\nschema-version: "0.1"\nprofile: "generic.v0"\ndocument-id: "bad-figure"\nlanguage: "en-GB"\nsource-system: "test"\nsource-id: "bad-figure"\nproducer: "test"\nproducer-version: "1"\n---\n\n:::oak-figure {id="figure" asset-id="image" media-type="image/png" src="https://example.test/image.png" alt-kind="text"}\n:::\n`,
    );

    expect(result).toMatchObject({
      success: false,
      error: { code: "invalid_markup" },
    });
  });

  it("reports directive constraints as markup errors at their source line", () => {
    const result = safeParseResourceMarkup(
      `${genericFrontmatter}\n:::oak-answer-space {id="space" kind="lines" lines="0"}\n:::\n`,
    );

    expect(result).toMatchObject({
      success: false,
      error: { code: "invalid_markup", context: { line: 12 } },
    });
  });

  it("reads maths only from LaTeX delimiters, leaving currency alone", () => {
    const document = parseResourceMarkup(
      `${genericFrontmatter}\n:::oak-paragraph {id="prices"}\nSam has $5 and Amir has $3, so \\(5 + 3 = 8\\).\n:::\n`,
    );

    expect(document.content[0]).toMatchObject({
      content: [
        { type: "text", text: "Sam has $5 and Amir has $3, so " },
        { type: "math", value: "5 + 3 = 8", display: false },
        { type: "text", text: "." },
      ],
    });
  });

  it("reports the line of a markup failure", () => {
    const result = safeParseResourceMarkup(
      `${genericFrontmatter}\n:::oak-section {id="section"}\n\n:::oak-callout {id="callout" role="tip"}\nHi\n:::\n:::\n`,
    );

    expect(result).toMatchObject({
      success: false,
      error: { code: "invalid_markup", context: { line: 14 } },
    });
    expect((result as { error: Error }).error.message).toContain(
      '"role" must be one of',
    );
  });

  it("rejects reserved directive-looking lines that do not match the grammar", () => {
    const malformedOpening = safeParseResourceMarkup(
      `${genericFrontmatter}\n:::oak-question id="question-1"\nPrompt\n:::\n`,
    );
    const strayClosing = safeParseResourceMarkup(
      `${genericFrontmatter}\nOrdinary prose\n:::\n`,
    );

    expect(malformedOpening).toMatchObject({
      success: false,
      error: { code: "invalid_markup", context: { line: 12 } },
    });
    expect(strayClosing).toMatchObject({
      success: false,
      error: { code: "invalid_markup", context: { line: 13 } },
    });
  });

  it("requires an independently versioned markup grammar", () => {
    const missing = safeParseResourceMarkup(
      genericFrontmatter.replace('markup-version: "0.1"\n', ""),
    );
    const unsupported = safeParseResourceMarkup(
      genericFrontmatter.replace('markup-version: "0.1"', 'markup-version: "0.2"'),
    );

    expect(missing).toMatchObject({
      success: false,
      error: { code: "invalid_markup" },
    });
    expect(unsupported).toMatchObject({
      success: false,
      error: { code: "invalid_markup", context: { line: 2 } },
    });
  });
});

describe("tables and code", () => {
  it.each(["oak-table", "oak-ion-table", "oak-rhythm-grid"])(
    "parses %s with explicit answer and empty cells",
    (directive) => {
      const doc = parseResourceMarkup(
        `${genericFrontmatter}\n:::${directive} {id="table"}\nName | Answer | Unused\nÉlève | ? | ~\n:::`,
      );
      expect(doc.content[0]).toMatchObject({
        type: "table",
        header: [
          { kind: "content", content: [{ type: "text", text: "Name" }] },
          { kind: "content", content: [{ type: "text", text: "Answer" }] },
          { kind: "content", content: [{ type: "text", text: "Unused" }] },
        ],
        rows: [
          [
            { kind: "content", content: [{ type: "text", text: "Élève" }] },
            { kind: "answer" },
            { kind: "empty" },
          ],
        ],
      });
      expect(doc.diagnostics).toEqual([]);
    },
  );
  it.each([
    ["no rows at all", "", /needs a row of cells beneath its header/],
    ["only a header row", "A | B", /needs a row of cells beneath its header/],
    ["header disabled and no rows", "", /needs at least one row of cells/],
  ])("rejects a table with %s", (_case, body, message) => {
    const header = _case === "header disabled and no rows" ? ' header="false"' : "";
    expect(() =>
      parseResourceMarkup(
        `${genericFrontmatter}\n:::oak-table {id="table"${header}}\n${body}\n:::`,
      ),
    ).toThrow(message);
  });
  it("supports a headerless table and rejects inconsistent widths", () => {
    const doc = parseResourceMarkup(
      `${genericFrontmatter}\n:::oak-table {id="table" header="false"}\na | ?\n:::`,
    );
    expect(doc.content[0]).not.toHaveProperty("header");
    expect(() =>
      parseResourceMarkup(
        `${genericFrontmatter}\n:::oak-table {id="table"}\na | b\nc\n:::`,
      ),
    ).toThrow();
  });
  it("preserves literal code, indentation, blank lines and trailing spaces", () => {
    const source = 'if ready:\n\tprint("é")  \n\n:::oak-question {id="literal"}';
    const doc = parseResourceMarkup(
      `${genericFrontmatter}\n:::oak-section {id="section"}\n:::oak-code-block {id="code" language="python"}\n${source}\n:::\n:::`,
    );
    expect(doc.content[0]).toMatchObject({
      children: [{ type: "codeBlock", language: "python", source }],
    });
  });
  it("normalises CRLF inside code so the canonical document is not editor-dependent", () => {
    const doc = parseResourceMarkup(
      `${genericFrontmatter}\n:::oak-code-block {id="code"}\r\nfirst\r\n  second\r\n:::`,
    );
    expect(doc.content[0]).toMatchObject({
      type: "codeBlock",
      source: "first\n  second",
    });
  });
  it("accepts paired outer pipes", () => {
    const doc = parseResourceMarkup(
      `${genericFrontmatter}\n:::oak-table {id="table"}\n| Name | Answer |\n| Élève | ? |\n:::`,
    );
    expect(doc.content[0]).toMatchObject({
      header: [
        { kind: "content", content: [{ type: "text", text: "Name" }] },
        { kind: "content", content: [{ type: "text", text: "Answer" }] },
      ],
      rows: [
        [
          { kind: "content", content: [{ type: "text", text: "Élève" }] },
          { kind: "answer" },
        ],
      ],
    });
  });

  it.each([false, true])(
    "uses the same cells for headers and body rows (outer pipes: %s)",
    (outerPipes) => {
      const content = "~ | ? | Élève \\(x\\) | ?";
      const row = outerPipes ? `| ${content} |` : content;
      const doc = parseResourceMarkup(
        `${genericFrontmatter}\n:::oak-table {id="table"}\n${row}\n${row}\n:::`,
      );
      const cells = [
        { kind: "empty" },
        { kind: "answer" },
        {
          kind: "content",
          content: [
            { type: "text", text: "Élève " },
            { type: "math", value: "x", display: false },
          ],
        },
        { kind: "answer" },
      ];
      expect(doc.content[0]).toMatchObject({ header: cells, rows: [cells] });
    },
  );

  it("preserves answer blanks at both ends of a row", () => {
    const doc = parseResourceMarkup(
      `${genericFrontmatter}\n:::oak-table {id="table"}\nA | B | C\n? | text | ?\n:::`,
    );
    expect(doc.content[0]).toMatchObject({
      rows: [
        [
          { kind: "answer" },
          { kind: "content", content: [{ type: "text", text: "text" }] },
          { kind: "answer" },
        ],
      ],
    });
  });

  it("preserves single-column answer rows and ignores formatting blank lines", () => {
    const doc = parseResourceMarkup(
      `${genericFrontmatter}\n:::oak-table {id="table"}\nA\n\n?\n \n~\n?\n:::`,
    );
    expect(doc.content[0]).toMatchObject({
      rows: [[{ kind: "answer" }], [{ kind: "empty" }], [{ kind: "answer" }]],
    });
  });

  it.each(["A | | B", " | B", "A | "])(
    "rejects implicit empty cells in headers and body rows: %s",
    (row) => {
      for (const header of [true, false]) {
        expect(() =>
          parseResourceMarkup(
            `${genericFrontmatter}\n:::oak-table {id="table" header="${header}"}\n${row}\nA | B\n:::`,
          ),
        ).toThrow("Use ? for an answer blank or ~ for an empty table cell.");
      }
    },
  );
});
