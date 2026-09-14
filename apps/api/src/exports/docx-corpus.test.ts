import {
  loadOriginalResourceDocumentFixture,
  originalResourceDocumentFixtureManifest,
} from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import { walkResourceDocument } from "@oaknational/resource-document";
import type { ResourceNode } from "@oaknational/resource-document";
import { describe, expect, it } from "vitest";

import { generateDocx } from "./docx";
import {
  attributes,
  children,
  documentWith,
  enabled,
  expectRowHeight,
  find,
  imageDocument,
  mediaFiles,
  one,
  paragraph,
  paragraphStyle,
  rows,
  select,
  setupDocxTests,
  text,
  unpack,
  worksheetFixture,
} from "./docx.test-support";

setupDocxTests();

describe("DOCX worksheetFixture() exports", () => {
  it("gives the rhythm grid a wider label column with matching cell widths", async () => {
    const { expectedDocument } = await loadOriginalResourceDocumentFixture(
      "adding-rhythmic-variation-to-ground-bass",
    );
    const { body } = unpack(
      await generateDocx(expectedDocument, { embedFigures: false }),
    );
    const grid = select(body, "w:tbl").find((node) => text(node).includes("Variation"));
    expect(grid).toBeDefined();
    const widths = find([grid!], "w:gridCol").map((node) =>
      Number(attributes(node)["w:w"]),
    );
    expect(widths).toHaveLength(9);
    expect(widths[0]).toBeGreaterThanOrEqual(1550);
    expect(widths[0]).toBeGreaterThan(Math.max(...widths.slice(1)));
    expect(widths.reduce((sum, value) => sum + value, 0)).toBe(9638);
    for (const row of rows(grid!)) {
      expect(
        find([row], "w:tcW").map((node) => Number(attributes(node)["w:w"])),
      ).toEqual(widths);
    }
    expect(attributes(one([grid!], "w:tblLayout"))["w:type"]).toBe("fixed");
  });

  it("renders common operators and missing-number squares in the quotient worksheetFixture()", async () => {
    const { expectedDocument } = await loadOriginalResourceDocumentFixture(
      "explain-how-the-quotient-is-affected-when-the-divisor-is-equal-to-the-dividend",
    );
    const { paragraphs } = unpack(
      await generateDocx(expectedDocument, { embedFigures: false }),
    );
    for (const value of [1, 3, 5]) {
      expect(paragraphs.map(text)).toContain(
        `Complete ${value} = ${value} × □ and ${value} ÷ ${value} = □.`,
      );
    }
  });

  it("converts symbols in inline and display maths without rewriting text or code", async () => {
    const literal = String.raw`\times \div \square`;
    const unknown = String.raw`\frac{1}{2} + \sqrt{x} + x^{2}`;
    const source = documentWith([
      {
        id: "mixed",
        type: "paragraph",
        content: [
          { type: "text", text: literal },
          { type: "math", value: literal, display: false },
          { type: "math", value: `${literal} ${unknown}`, display: true },
          { type: "text", text: "After the expression" },
        ],
      },
      { id: "code", type: "codeBlock", source: literal },
    ]);
    const before = structuredClone(source);
    const { paragraphs, body } = unpack(
      await generateDocx(source, { embedFigures: false }),
    );
    expect(paragraphs.map(text)).toEqual([
      `${literal}× ÷ □`,
      `× ÷ □ ${unknown}`,
      "After the expression",
      literal,
    ]);
    expect(attributes(one([paragraphs[1]!], "w:jc"))["w:val"]).toBe("center");
    expect(find(body, "m:oMath")).toHaveLength(0);
    expect(source).toEqual(before);
  });

  it("keeps Nile question prompts with the start of their response space, not every writing row", async () => {
    const { expectedDocument } =
      await loadOriginalResourceDocumentFixture("the-river-nile");
    const { body } = unpack(
      await generateDocx(expectedDocument, { embedFigures: false }),
    );
    for (const prefix of ["The Nile carried", "Around 3,000 BCE"]) {
      const index = body.findIndex((node) => text(node).startsWith(prefix));
      expect(index).toBeGreaterThan(-1);
      expect(enabled([body[index]!], "w:keepNext")).toHaveLength(1);
      expect(enabled([body[index]!], "w:keepLines")).toHaveLength(0);
      const writingTable = body[index + 1]!;
      expect(Object.hasOwn(writingTable, "w:tbl")).toBe(true);
      for (const row of rows(writingTable)) {
        expect(enabled([row], "w:cantSplit")).toHaveLength(1);
        expect(enabled([row], "w:keepNext")).toHaveLength(0);
        expect(attributes(one([row], "w:keepNext"))["w:val"]).toBe("false");
      }
    }
  });

  it.each(["automatic", "break-before", "break-after", "opt-out", "outside-question"])(
    "applies response grouping only where appropriate: %s",
    async (mode) => {
      const prompt = paragraph("prompt", "Question prompt");
      if (mode === "break-after") prompt.layout = { breakAfter: "page" };
      if (mode === "opt-out") prompt.layout = { keepWithNext: false };
      const response: ResourceNode = {
        id: "response",
        type: "responseSpace",
        kind: "lines",
        lines: 12,
        ...(mode === "break-before"
          ? { layout: { breakBefore: "page" as const } }
          : {}),
      };
      const content: ResourceNode[] =
        mode === "outside-question"
          ? [prompt, response]
          : [
              {
                id: "question",
                type: "question",
                children: [
                  {
                    id: "section",
                    type: "section",
                    children: [prompt, response],
                  },
                ],
              },
            ];
      const { paragraphs, body } = unpack(
        await generateDocx(documentWith(content), { embedFigures: false }),
      );
      const renderedPrompt = paragraphs.find(
        (node) => text(node) === "Question prompt",
      )!;
      expect(enabled([renderedPrompt], "w:keepNext")).toHaveLength(
        mode === "automatic" ? 1 : 0,
      );
      expect(enabled(body, "w:pageBreakBefore")).toHaveLength(
        mode.startsWith("break-") ? 1 : 0,
      );
      expect(rows(one(body, "w:tbl"))).toHaveLength(12);
    },
  );

  it.each([
    {
      fixtureId: "forming-ions-for-ionic-bonding",
      prefix: "Use a periodic table",
      nextTag: "w:tbl",
    },
    { fixtureId: "the-river-nile", prefix: "Write the meaning", nextTag: "w:tbl" },
  ])(
    "keeps the table prompt with its table in $fixtureId",
    async ({ fixtureId, prefix, nextTag }) => {
      const { expectedDocument } = await loadOriginalResourceDocumentFixture(fixtureId);
      const { body } = unpack(
        await generateDocx(expectedDocument, { embedFigures: false }),
      );
      const index = body.findIndex((node) => text(node).startsWith(prefix));
      expect(index).toBeGreaterThan(-1);
      expect(enabled([body[index]!], "w:keepNext")).toHaveLength(1);
      expect(Object.hasOwn(body[index + 1]!, nextTag)).toBe(true);
    },
  );

  it.each(["codeBlock", "figure"] as const)(
    "keeps a question prompt with its following %s",
    async (type) => {
      const source = imageDocument();
      const following: ResourceNode =
        type === "figure"
          ? source.content[0]!
          : {
              id: "code",
              type: "codeBlock",
              source: "print(1)",
            };
      source.content = [
        {
          id: "question",
          type: "question",
          children: [paragraph("prompt", "Use the following example."), following],
        },
      ];
      const { paragraphs } = unpack(
        await generateDocx(source, { embedFigures: false }),
      );
      const prompt = paragraphs.find(
        (node) => text(node) === "Use the following example.",
      )!;
      expect(enabled([prompt], "w:keepNext")).toHaveLength(1);
    },
  );

  it.each([
    {
      fixtureId: "adopting-different-perspectives",
      prefixes: [
        "Instructions: Write the same scene",
        "Instructions: Write an internal monologue",
      ],
    },
    {
      fixtureId: "air-resistance-do-and-review",
      prefixes: ["Instructions: Does the area"],
    },
  ])(
    "honours worksheetFixture() instruction hints in $fixtureId",
    async ({ fixtureId, prefixes }) => {
      const { expectedDocument } = await loadOriginalResourceDocumentFixture(fixtureId);
      const { paragraphs } = unpack(
        await generateDocx(expectedDocument, { embedFigures: false }),
      );
      for (const prefix of prefixes) {
        const instruction = paragraphs.find((node) => text(node).startsWith(prefix));
        expect(instruction).toBeDefined();
        expect(enabled([instruction!], "w:keepNext")).toHaveLength(1);
      }
    },
  );

  it("preserves worksheet reading order, semantic headings, maths, figure fallbacks and metadata", async () => {
    const { paragraphs, part, files } = unpack(await generateDocx(worksheetFixture()));
    expect(paragraphs.map(text).filter(Boolean)).toEqual([
      "Exploring linear equations",
      "Learning objective: Solve equations of the form ax + b = c and explain each step clearly.",
      "Instructions: Show your working. You may use the balance model to help you.",
      "Image unavailable in this document\nA balanced scale with 3x + 4 on the left and 24 on the right.",
      "A balance model for solving the equations.",
      "Credit: Oak National Academy",
      "Question 1 (2 marks)",
      "Solve the equation\n2x + x = 20",
      "Question 2 (3 marks)",
      "Maya starts with\n",
      "5y - 7 = 18.",
      "\nShe says the first step is to divide both sides by 5. Explain her error, then solve the equation.",
    ]);
    expect(paragraphStyle(paragraphs[0]!)).toBe("Heading1");
    for (const question of paragraphs.filter((node) =>
      text(node).startsWith("Question "),
    )) {
      expect(paragraphStyle(question)).toBe("Heading2");
      expect(enabled([question], "w:keepNext")).toHaveLength(1);
    }
    const maths = paragraphs.filter((node) => text(node) === "5y - 7 = 18.");
    expect(attributes(one(maths, "w:jc"))["w:val"]).toBe("center");
    expect(attributes(one(maths, "w:rFonts"))["w:ascii"]).toBe("Cambria");
    for (const caption of paragraphs.filter(
      (node) =>
        text(node).startsWith("A balance model") || text(node).startsWith("Credit:"),
    ))
      expect(paragraphStyle(caption)).toBe(
        text(caption).startsWith("Credit:") ? "ImageCredit" : "Caption",
      );
    expect(text(one(part("docProps/core.xml"), "dc:title"))).toBe(
      worksheetFixture().metadata.title,
    );
    expect(text(one(part("docProps/core.xml"), "dc:creator"))).toBe(
      "Oak National Academy",
    );
    expect(
      attributes(one(find(part("word/styles.xml"), "w:docDefaults"), "w:lang"))[
        "w:val"
      ],
    ).toBe("en-GB");
    expect(mediaFiles(files)).toEqual([]);
  });

  it("defines Heading1 with outline level zero for document navigation", async () => {
    const { part } = unpack(
      await generateDocx(worksheetFixture(), { embedFigures: false }),
    );
    const heading1 = find(part("word/styles.xml"), "w:style").filter(
      (node) => attributes(node)["w:styleId"] === "Heading1",
    );
    expect(heading1).toHaveLength(1);
    expect(attributes(one(heading1, "w:outlineLvl"))["w:val"]).toBe("0");
  });

  it("defines an explicit body style so prompts do not depend on importer defaults", async () => {
    const { part, paragraphs, body } = unpack(
      await generateDocx(worksheetFixture(), { embedFigures: false }),
    );
    const styles = find(part("word/styles.xml"), "w:style");
    const normal = styles.filter((node) => attributes(node)["w:styleId"] === "Normal");
    expect(normal).toHaveLength(1);
    expect(attributes(one(normal, "w:rFonts"))).toMatchObject({
      "w:ascii": "Lexend",
      "w:hAnsi": "Lexend",
      "w:cs": "Lexend",
    });
    expect(attributes(one(normal, "w:sz"))["w:val"]).toBe("22");
    expect(attributes(one(normal, "w:b"))["w:val"]).toBe("false");
    expect(attributes(one(normal, "w:i"))["w:val"]).toBe("false");
    expect(attributes(one(normal, "w:outlineLvl"))["w:val"]).toBe("9");
    expect(attributes(one(normal, "w:spacing"))).toMatchObject({
      "w:before": "0",
      "w:after": "120",
      "w:line": "276",
    });
    for (const prompt of paragraphs.filter((node) =>
      /^(Solve the equation|Maya starts|5y|\nShe says|A balanced scale)/.test(
        text(node),
      ),
    )) {
      expect(paragraphStyle(prompt)).toBe("Normal");
      expect(enabled([prompt], "w:b")).toHaveLength(0);
      expect(enabled([prompt], "w:i")).toHaveLength(0);
    }
    for (const paragraph of find(body, "w:p")) {
      expect(paragraphStyle(paragraph)).toBeDefined();
    }
    const styleIds = new Set(styles.map((node) => attributes(node)["w:styleId"]));
    const paragraphStyles = styles.filter(
      (node) => attributes(node)["w:type"] === "paragraph",
    );
    for (const reference of find(paragraphStyles, "w:basedOn")) {
      expect(styleIds.has(attributes(reference)["w:val"])).toBe(true);
    }
    for (const style of styles.filter((node) =>
      /^Heading[1-9]$/.test(attributes(node)["w:styleId"] ?? ""),
    )) {
      expect(attributes(one([style], "w:rFonts"))["w:ascii"]).toBe("Lexend");
    }
  });

  it("creates four- and six-line response tables at the correct points in the document", async () => {
    const { body } = unpack(
      await generateDocx(worksheetFixture(), { embedFigures: false }),
    );
    const tables = select(body, "w:tbl");
    expect(tables).toHaveLength(2);
    for (const [index, table] of tables.entries()) {
      const lineCount = [4, 6][index]!;
      const prompt = body[body.indexOf(table) - 1]!;
      expect(paragraphStyle(prompt)).toBe("Normal");
      expect(enabled([prompt], "w:keepNext")).toHaveLength(1);
      expect(rows(table)).toHaveLength(lineCount);
      expect(attributes(one([table], "w:tblW"))).toMatchObject({
        "w:w": "9638",
        "w:type": "dxa",
      });
      expect(attributes(one([table], "w:tblLayout"))["w:type"]).toBe("fixed");
      const borders = find([table], "w:tblBorders");
      for (const edge of ["top", "left", "right", "insideV"]) {
        expect(attributes(one(borders, `w:${edge}`))["w:val"]).toBe("none");
      }
      for (const edge of ["bottom", "insideH"]) {
        expect(attributes(one(borders, `w:${edge}`))).toMatchObject({
          "w:val": "single",
          "w:sz": "4",
          "w:color": "777777",
        });
      }
      for (const row of rows(table)) {
        expectRowHeight(row, 400);
        one([row], "w:cantSplit");
        expect(select(children(row), "w:tc")).toHaveLength(1);
        expect(text(row)).toBe("");
      }
    }
  });

  it.each(originalResourceDocumentFixtureManifest.map(({ id }) => id))(
    "leaves question, section, table and writing-space boundaries unchained in %s",
    async (id) => {
      const { expectedDocument } = await loadOriginalResourceDocumentFixture(id);
      // Chaining a boundary to the next block forces unrelated content onto one page.
      const chained = Array.from(walkResourceDocument(expectedDocument)).filter(
        (node) =>
          ["question", "section", "table", "responseSpace"].includes(node.type) &&
          node.layout?.keepWithNext === true,
      );

      expect(chained).toEqual([]);
    },
  );

  it.each(originalResourceDocumentFixtureManifest.map(({ id }) => id))(
    "exports %s as a valid offline OOXML package",
    async (id) => {
      const { expectedDocument } = await loadOriginalResourceDocumentFixture(id);
      const before = structuredClone(expectedDocument);
      const { part } = unpack(
        await generateDocx(expectedDocument, { embedFigures: false }),
      );
      expect(text(one(part("docProps/core.xml"), "dc:title"))).toBe(
        expectedDocument.metadata.title ?? "Untitled resource",
      );
      expect(expectedDocument).toEqual(before);
    },
  );
});
