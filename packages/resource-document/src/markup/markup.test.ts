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
