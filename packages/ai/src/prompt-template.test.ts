import { describe, expect, expectTypeOf, it } from "vitest";

import { definePromptTemplate, renderPromptTemplate } from "./index.js";
import type { PromptVariables } from "./index.js";

const template = definePromptTemplate({
  identifier: "lower-reading-age",
  template: "Rewrite for reading age {{readingAge}}.\n\n{{text}}",
});

describe("definePromptTemplate", () => {
  it("derives the required variables from the template body", () => {
    expectTypeOf<PromptVariables<"Age {{readingAge}}: {{text}}">>().toEqualTypeOf<
      Readonly<Record<"readingAge" | "text", string>>
    >();
  });

  it("hashes the same definition to the same value", () => {
    const again = definePromptTemplate({
      identifier: "lower-reading-age",
      template: "Rewrite for reading age {{readingAge}}.\n\n{{text}}",
    });

    expect(again.hash).toBe(template.hash);
  });

  it("hashes a changed body to a different value", () => {
    const edited = definePromptTemplate({
      identifier: "lower-reading-age",
      template: "Rewrite for reading age {{readingAge}}.\n\n{{text}}\n\nBe concise.",
    });

    expect(edited.hash).not.toBe(template.hash);
  });

  it("hashes the same body under a new identifier to a different value", () => {
    const renamed = definePromptTemplate({
      identifier: "simplify-reading-age",
      template: "Rewrite for reading age {{readingAge}}.\n\n{{text}}",
    });

    expect(renamed.hash).not.toBe(template.hash);
  });

  it("rejects an identifier that is not lowercase and hyphen-separated", () => {
    expect(() =>
      definePromptTemplate({
        identifier: "Lower Reading Age",
        template: "{{text}}",
      }),
    ).toThrow(/must be lowercase and hyphen-separated/);
  });

  it("rejects an empty body", () => {
    expect(() =>
      definePromptTemplate({
        identifier: "lower-reading-age",
        template: "   ",
      }),
    ).toThrow(/empty body/);
  });

  it.each([
    ["whitespace inside", "Rewrite for {{ readingAge }}."],
    ["an unclosed opening delimiter", "Rewrite for {{readingAge."],
    ["an unmatched closing delimiter", "Rewrite for readingAge}}."],
    ["an extra opening brace", "Rewrite for {{{readingAge}}."],
    ["an extra closing brace", "Rewrite for {{readingAge}}}."],
  ])("rejects a malformed placeholder with %s", (_case, malformedTemplate) => {
    expect(() =>
      definePromptTemplate({
        identifier: "lower-reading-age",
        template: malformedTemplate,
      }),
    ).toThrow(/malformed placeholder syntax/);
  });
});

describe("renderPromptTemplate", () => {
  it("substitutes every placeholder", () => {
    expect(
      renderPromptTemplate(template, { readingAge: "9", text: "Photosynthesis." }),
    ).toBe("Rewrite for reading age 9.\n\nPhotosynthesis.");
  });

  it("substitutes a repeated placeholder every time", () => {
    const repeated = definePromptTemplate({
      identifier: "repeated",
      template: "{{word}} and {{word}}",
    });

    expect(renderPromptTemplate(repeated, { word: "again" })).toBe("again and again");
  });

  it("throws when a variable is missing", () => {
    expect(() =>
      // @ts-expect-error the template requires `text`, which the type demands.
      renderPromptTemplate(template, { readingAge: "9" }),
    ).toThrow(/needs a value for \{\{text\}\}/);
  });

  it("throws when a supplied variable has no placeholder", () => {
    expect(() =>
      renderPromptTemplate(template, {
        readingAge: "9",
        text: "Photosynthesis.",
        // @ts-expect-error the template has no `tone` placeholder.
        tone: "plain",
      }),
    ).toThrow(/no placeholder for "tone"/);
  });

  it("leaves text that only resembles a placeholder alone", () => {
    const braces = definePromptTemplate({
      identifier: "braces",
      template: 'Return { "age": {{readingAge}} }',
    });

    expect(renderPromptTemplate(braces, { readingAge: "9" })).toBe(
      'Return { "age": 9 }',
    );
  });
});
