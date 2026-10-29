import type { ResourceNode } from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";
import { strFromU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { generateDocx } from "./docx";
import {
  attributes,
  children,
  documentWith,
  enabled,
  expectRowHeight,
  find,
  imageDocument,
  inline,
  one,
  paragraph,
  paragraphStyle,
  png,
  rows,
  select,
  setupDocxTests,
  text,
  unpack,
  worksheetFixture,
  type XmlNode,
} from "./docx.test-support";
import type { ImageLoader } from "./images";

setupDocxTests();

describe("DOCX synthetic node semantics", () => {
  it("renders questions inside nested sections and preserves heading six and optional labels/marks", async () => {
    const document = documentWith([
      {
        id: "section",
        type: "section",
        children: [
          { id: "heading", type: "heading", level: 6, content: inline("Deep heading") },
          {
            id: "nested-section",
            type: "section",
            children: [
              {
                id: "question",
                type: "question",
                label: "7(a)",
                marks: 1,
                children: [
                  {
                    id: "question-section",
                    type: "section",
                    children: [paragraph("prompt", "Nested prompt")],
                  },
                ],
              },
              { id: "zero-marks", type: "question", marks: 0, children: [] },
              { id: "no-label", type: "question", children: [] },
            ],
          },
          { id: "unmarked", type: "question", label: "B", children: [] },
        ],
      },
    ]);
    const { paragraphs } = unpack(await generateDocx(document));
    expect(paragraphs.map((node) => [text(node), paragraphStyle(node)])).toEqual([
      ["Deep heading", "Heading6"],
      ["Question 7(a) (1 mark)", "Heading7"],
      ["Nested prompt", "Normal"],
      ["Question (0 marks)", "Heading7"],
      ["Question", "Heading7"],
      ["Question B", "Heading7"],
    ]);
  });

  it("renders every definition-list variation without inventing missing definitions or examples", async () => {
    const document = documentWith([
      {
        id: "definitions",
        type: "definitionList",
        lead: inline("Vocabulary"),
        entries: [
          { term: inline("Term only") },
          {
            term: inline("Defined"),
            definition: inline("Definition only"),
            source: "oak-lesson",
          },
          {
            term: inline("Illustrated"),
            example: inline("Example only"),
            source: "generated",
          },
          {
            term: inline("Complete"),
            definition: inline("Both definition"),
            example: inline("Both example"),
          },
        ],
      },
      { id: "no-lead", type: "definitionList", entries: [{ term: inline("No lead") }] },
    ]);
    const { paragraphs } = unpack(await generateDocx(document));
    expect(paragraphs.map(text)).toEqual([
      "Vocabulary",
      "Term only",
      "Defined",
      "Definition only",
      "Illustrated",
      "Example: Example only",
      "Complete",
      "Both definition",
      "Example: Both example",
      "No lead",
    ]);
    for (const term of ["Term only", "Defined", "Illustrated", "Complete", "No lead"]) {
      one(
        paragraphs.filter((node) => text(node) === term),
        "w:b",
      );
    }
    for (const value of [
      "Definition only",
      "Example: Example only",
      "Both definition",
      "Example: Both example",
    ]) {
      expect(
        attributes(
          one(
            paragraphs.filter((node) => text(node) === value),
            "w:ind",
          ),
        )["w:left"],
      ).toBe("240");
    }
  });

  it.each([
    {
      kind: "lines",
      lines: 4,
      width: "full",
      rowCount: 4,
      columns: 1,
      height: 400,
      tableWidth: 9638,
    },
    {
      kind: "lines",
      lines: 2,
      width: "half",
      rowCount: 2,
      columns: 1,
      height: 400,
      tableWidth: 4819,
    },
    {
      kind: "box",
      lines: undefined,
      width: "full",
      rowCount: 1,
      columns: 1,
      height: 2400,
      tableWidth: 9638,
    },
    {
      kind: "box",
      lines: undefined,
      width: "half",
      rowCount: 1,
      columns: 1,
      height: 2400,
      tableWidth: 4819,
    },
    {
      kind: "grid",
      lines: undefined,
      width: "full",
      rowCount: 6,
      columns: 24,
      height: 400,
      tableWidth: 9600,
    },
    {
      kind: "grid",
      lines: undefined,
      width: "half",
      rowCount: 6,
      columns: 12,
      height: 400,
      tableWidth: 4800,
    },
  ] as const)(
    "renders $kind response space ($width, lines=$lines)",
    async ({ kind, lines, width, rowCount, columns, height, tableWidth }) => {
      const document = documentWith([
        {
          id: "response",
          type: "responseSpace",
          kind,
          ...(lines === undefined ? {} : { lines }),
          layout: { preferredWidth: width },
        },
      ]);
      const { body, paragraphs } = unpack(await generateDocx(document));
      expect(paragraphs.map(text).filter(Boolean)).toEqual([]);
      expect(body.map(text).join("")).toBe("");
      expect(enabled(paragraphs, "w:keepNext")).toHaveLength(0);
      const table = one(body, "w:tbl");
      expect(rows(table)).toHaveLength(rowCount);
      expect(attributes(one([table], "w:tblW"))["w:w"]).toBe(String(tableWidth));
      expect(find([table], "w:gridCol")).toHaveLength(columns);
      for (const row of rows(table)) {
        expectRowHeight(row, height);
        expect(select(children(row), "w:tc")).toHaveLength(columns);
        one([row], "w:cantSplit");
        expect(text(row)).toBe("");
      }
      const borders = find([table], "w:tblBorders");
      for (const edge of ["top", "left", "right"]) {
        expect(attributes(one(borders, `w:${edge}`))["w:val"]).toBe(
          kind === "lines" ? "none" : "single",
        );
      }
      expect(attributes(one(borders, "w:bottom"))["w:val"]).toBe("single");
      expect(attributes(one(borders, "w:insideH"))["w:val"]).toBe("single");
      expect(attributes(one(borders, "w:insideV"))["w:val"]).toBe(
        kind === "grid" ? "single" : "none",
      );
    },
  );

  it.each([
    { kind: "lines", lines: undefined, rowCount: 4, height: 400 },
    { kind: "box", lines: 3, rowCount: 1, height: 1200 },
    { kind: "grid", lines: 2, rowCount: 2, height: 400 },
  ] as const)(
    "defensively handles $kind with lines=$lines outside schema invariants",
    async ({ kind, lines, rowCount, height }) => {
      const document = documentWith([
        { id: "response", type: "responseSpace", kind: "lines", lines: 4 },
      ]);
      // Schema 0.1 requires a line count only for lines; exercise converter fallbacks directly.
      document.content = [
        {
          id: "response",
          type: "responseSpace",
          kind,
          ...(lines === undefined ? {} : { lines }),
        },
      ];
      const { body } = unpack(await generateDocx(document));
      const table = one(body, "w:tbl");
      expect(rows(table)).toHaveLength(rowCount);
      for (const row of rows(table)) expectRowHeight(row, height);
    },
  );

  it.each([
    {
      label: "adjacent break-after and break-before",
      layouts: [{ breakAfter: "page" }, { breakBefore: "page" }],
      breaks: 1,
    },
    {
      label: "a trailing break-after",
      layouts: [{}, { breakAfter: "page" }],
      breaks: 0,
    },
    {
      label: "a single break-before",
      layouts: [{}, { breakBefore: "page" }],
      breaks: 1,
    },
  ] as const)("emits one page break for $label", async ({ layouts, breaks }) => {
    const document = documentWith(
      layouts.map((layout, index) => ({
        ...paragraph(`text-${index}`, `Paragraph ${index}`),
        ...(Object.keys(layout).length ? { layout } : {}),
      })),
    );

    const { body } = unpack(await generateDocx(document, { embedFigures: false }));

    expect(enabled(body, "w:pageBreakBefore")).toHaveLength(breaks);
  });

  it("carries a break after a section's last child to the following sibling", async () => {
    const document = documentWith([
      {
        id: "section",
        type: "section",
        children: [
          { ...paragraph("inside", "Last in section"), layout: { breakAfter: "page" } },
        ],
      },
      paragraph("after", "After the section"),
    ]);

    const { body, paragraphs } = unpack(
      await generateDocx(document, { embedFigures: false }),
    );

    expect(enabled(body, "w:pageBreakBefore")).toHaveLength(1);
    const broken = paragraphs.findIndex(
      (node) => enabled([node], "w:pageBreakBefore").length === 1,
    );
    expect(text(paragraphs[broken + 1]!)).toBe("After the section");
  });

  it("coalesces parent, empty-container and first-descendant page breaks", async () => {
    const document = documentWith([
      { ...paragraph("before", "Before"), layout: { breakAfter: "page" } },
      {
        id: "outer",
        type: "section",
        layout: { breakBefore: "page" },
        children: [
          {
            id: "empty",
            type: "section",
            layout: { breakBefore: "page", breakAfter: "page" },
            children: [],
          },
          {
            id: "inner",
            type: "section",
            layout: { breakBefore: "page" },
            children: [
              { ...paragraph("after", "After"), layout: { breakBefore: "page" } },
            ],
          },
        ],
      },
    ]);
    const { body, paragraphs } = unpack(
      await generateDocx(document, { embedFigures: false }),
    );
    expect(enabled(body, "w:pageBreakBefore")).toHaveLength(1);
    expect(paragraphs.map(text)).toEqual(["Before", "", "After"]);
    expect(enabled([paragraphs[1]!], "w:pageBreakBefore")).toHaveLength(1);
  });

  it.each([true, false])(
    "defers breaks past empty sections and omitted figures (following content=%s)",
    async (hasFollowing) => {
      const document = imageDocument({ kind: "decorative" });
      const omitted = document.content[0]!;
      if (omitted.type === "figure") delete omitted.caption;
      document.content = [
        { ...paragraph("before", "Before"), layout: { breakAfter: "page" } },
        { id: "empty", type: "section", children: [] },
        { ...omitted, layout: { breakBefore: "page", breakAfter: "page" } },
        ...(hasFollowing ? [paragraph("after", "After")] : []),
      ];
      const { body, paragraphs } = unpack(
        await generateDocx(document, { embedFigures: false }),
      );
      expect(enabled(body, "w:pageBreakBefore")).toHaveLength(hasFollowing ? 1 : 0);
      expect(paragraphs.map(text)).toEqual(
        hasFollowing ? ["Before", "", "After"] : ["Before"],
      );
    },
  );

  it("consumes a pending break at a question heading before rendering its children", async () => {
    const document = documentWith([
      { ...paragraph("before", "Before"), layout: { breakAfter: "page" } },
      {
        id: "question",
        type: "question",
        children: [
          { ...paragraph("prompt", "Prompt"), layout: { breakAfter: "page" } },
        ],
      },
      paragraph("after", "After"),
    ]);
    const { paragraphs, body } = unpack(
      await generateDocx(document, { embedFigures: false }),
    );
    expect(paragraphs.map(text)).toEqual([
      "Before",
      "",
      "Question",
      "Prompt",
      "",
      "After",
    ]);
    expect(enabled(body, "w:pageBreakBefore")).toHaveLength(2);
    for (const index of [1, 4])
      expect(enabled([paragraphs[index]!], "w:pageBreakBefore")).toHaveLength(1);
  });

  it.each([
    ["learning-objective", "Learning objective: Aim"],
    ["instruction", "Instructions: Aim"],
    ["note", "Note: Aim"],
    ["warning", "Warning: Aim"],
  ] as const)("labels a %s callout", async (role, expected) => {
    const document = documentWith([
      { id: "callout", type: "callout", role, content: inline("Aim") },
    ]);

    const { paragraphs } = unpack(
      await generateDocx(document, { embedFigures: false }),
    );

    expect(paragraphs.map(text)).toEqual([expected]);
    expect(paragraphStyle(paragraphs[0]!)).toBe("Callout");
  });

  it.each([1, 2, 3, 4])(
    "keeps a level-%i heading inside a question below the question's own heading",
    async (level) => {
      const document = documentWith([
        { id: "top", type: "heading", level: 1, content: inline("Worksheet") },
        {
          id: "question",
          type: "question",
          children: [
            { id: "inner", type: "heading", level, content: inline("Part one") },
            paragraph("prompt", "Prompt"),
          ],
        },
        paragraph("after", "After the question"),
      ]);

      const { paragraphs } = unpack(
        await generateDocx(document, { embedFigures: false }),
      );

      expect(paragraphs.map((node) => [text(node), paragraphStyle(node)])).toEqual([
        ["Worksheet", "Heading1"],
        ["Question", "Heading2"],
        ["Part one", `Heading${Math.max(3, level)}`],
        ["Prompt", "Normal"],
        ["After the question", "Normal"],
      ]);
    },
  );

  it("keeps an unsplittable writing box within the page height", async () => {
    const document = documentWith([
      { id: "response", type: "responseSpace", kind: "lines", lines: 4 },
    ]);
    document.content = [
      { id: "response", type: "responseSpace", kind: "box", lines: 100 },
    ];

    const { body } = unpack(await generateDocx(document, { embedFigures: false }));

    const row = rows(one(body, "w:tbl"))[0]!;
    expectRowHeight(row, 14570);
    one([row], "w:cantSplit");
  });

  it.each([true, false])(
    "makes table rows unsplittable only when keepTogether is %s",
    async (keepTogether) => {
      const document = documentWith([
        {
          id: "table",
          type: "table",
          role: "comparison",
          rows: [
            [{ kind: "content", content: inline("First") }],
            [{ kind: "content", content: inline("Second") }],
          ],
          layout: { keepTogether },
        },
      ]);

      const { body } = unpack(await generateDocx(document, { embedFigures: false }));

      expect(enabled(rows(one(body, "w:tbl")), "w:cantSplit")).toHaveLength(
        keepTogether ? 2 : 0,
      );
    },
  );

  it("honours an explicit keep-with-next hint on a captionless figure", async () => {
    const source = imageDocument({ kind: "missing" });
    const figure = source.content[0]!;
    if (figure.type === "figure") {
      delete figure.caption;
      figure.layout = { keepWithNext: true };
    }
    delete source.assets[0]!.credit;
    const document = parseResourceDocument(source);

    const { paragraphs } = unpack(
      await generateDocx(document, { embedFigures: false }),
    );

    expect(paragraphStyle(paragraphs[0]!)).toBe("MissingImage");
    expect(enabled([paragraphs[0]!], "w:keepNext")).toHaveLength(1);
  });

  it.each(["table", "lines", "grid", "box"] as const)(
    "links only the last row of a %s to its spacer and following content",
    async (kind) => {
      const node: ResourceNode =
        kind === "table"
          ? {
              id: "table",
              type: "table",
              role: "example",
              header: [
                { kind: "content", content: inline("Header") },
                { kind: "empty" },
              ],
              rows: [
                [
                  { kind: "content", content: inline("Earlier row") },
                  { kind: "answer" },
                ],
                [
                  {
                    kind: "content",
                    content: [
                      { type: "text", text: "Final row" },
                      { type: "math", value: "x = 1", display: true },
                    ],
                  },
                  { kind: "answer" },
                ],
              ],
              layout: { keepWithNext: true },
            }
          : {
              id: "writing",
              type: "responseSpace",
              kind,
              ...(kind === "lines" ? { lines: 3 } : {}),
              layout: { keepWithNext: true },
            };
      const { body, paragraphs } = unpack(
        await generateDocx(
          documentWith([node, paragraph("after", "Following content")]),
          { embedFigures: false },
        ),
      );
      const tableRows = rows(one(body, "w:tbl"));
      for (const row of tableRows.slice(0, -1))
        expect(enabled([row], "w:keepNext")).toHaveLength(0);
      const finalParagraphs = find([tableRows.at(-1)!], "w:p");
      expect(finalParagraphs.length).toBeGreaterThan(0);
      for (const node of finalParagraphs)
        expect(enabled([node], "w:keepNext")).toHaveLength(1);
      expect(enabled([paragraphs.at(-2)!], "w:keepNext")).toHaveLength(1);
      expect(enabled([paragraphs.at(-1)!], "w:keepNext")).toHaveLength(0);
    },
  );

  it.each(
    [true, false].flatMap((keepNext) =>
      [true, false].flatMap((embedded) =>
        [true, false].map((withCredit) => ({ keepNext, embedded, withCredit })),
      ),
    ),
  )(
    "groups a captioned figure internally (keepWithNext=$keepNext, embedded=$embedded, credited=$withCredit)",
    async ({ keepNext, embedded, withCredit }) => {
      const document = imageDocument();
      const figure = document.content[0]!;
      if (figure.type !== "figure")
        throw new Error("Expected worksheetFixture() figure");
      figure.layout = { keepWithNext: keepNext };
      figure.caption = [
        { type: "text", text: "Caption before" },
        { type: "math", value: "x = 1", display: true },
        { type: "text", text: "Caption after" },
      ];
      if (!withCredit) delete document.assets[0]!.credit;
      document.content.push(paragraph("after", "Following content"));
      const imageLoader = vi
        .fn<ImageLoader>()
        .mockResolvedValue({ data: png, type: "png", width: 1, height: 1 });

      const { paragraphs } = unpack(
        await generateDocx(document, { embedFigures: embedded, imageLoader }),
      );

      for (const node of paragraphs.slice(0, -2))
        expect(enabled([node], "w:keepNext")).toHaveLength(1);
      expect(paragraphStyle(paragraphs.at(-2)!)).toBe(
        withCredit ? "ImageCredit" : "Caption",
      );
      expect(enabled([paragraphs.at(-2)!], "w:keepNext")).toHaveLength(
        keepNext ? 1 : 0,
      );
      expect(enabled([paragraphs.at(-1)!], "w:keepNext")).toHaveLength(0);
    },
  );

  it("applies a decorative figure's external hint to its retained caption", async () => {
    const document = imageDocument({ kind: "decorative" });
    document.content[0]!.layout = { keepWithNext: true };
    document.content.push(paragraph("after", "Following content"));
    const { paragraphs } = unpack(
      await generateDocx(document, { embedFigures: false }),
    );
    expect(paragraphs.map(text)).toEqual(["Figure caption", "Following content"]);
    expect(enabled([paragraphs[0]!], "w:keepNext")).toHaveLength(1);
    expect(enabled([paragraphs[1]!], "w:keepNext")).toHaveLength(0);
    expect(attributes(one([paragraphs[0]!], "w:spacing"))).toMatchObject({
      "w:before": "40",
      "w:after": "160",
    });
  });

  it.each([true, false])(
    "renders table content, answer and empty cells (header=%s)",
    async (withHeader) => {
      const document = documentWith([
        {
          id: "table",
          type: "table",
          role: "comparison",
          ...(withHeader
            ? {
                header: [
                  { kind: "content" as const, content: inline("Given") },
                  { kind: "content" as const, content: inline("Answer column") },
                  { kind: "content" as const, content: inline("Notes") },
                ],
              }
            : {}),
          rows: [
            [
              { kind: "content", content: inline("Body value") },
              { kind: "answer" },
              { kind: "empty" },
            ],
          ],
        },
      ]);
      const table = one(unpack(await generateDocx(document)).body, "w:tbl");
      expect(rows(table)).toHaveLength(withHeader ? 2 : 1);
      const bodyRow = rows(table).at(-1)!;
      const cells = select(children(bodyRow), "w:tc");
      expect(cells.map(text)).toEqual(["Body value", "", ""]);
      expect(paragraphStyle(one([cells[1]!], "w:p"))).toBe("Normal");
      one([cells[2]!], "w:p");
      expect(enabled([bodyRow], "w:b")).toEqual([]);
      expectRowHeight(bodyRow, 400);
      if (withHeader) {
        const header = rows(table)[0]!;
        expect(select(children(header), "w:tc").map(text)).toEqual([
          "Given",
          "Answer column",
          "Notes",
        ]);
        expect(enabled([header], "w:tblHeader")).toHaveLength(1);
        expect(enabled([header], "w:b")).toHaveLength(3);
      }
      expect(enabled([bodyRow], "w:tblHeader")).toEqual([]);
    },
  );

  it("preserves code whitespace, tabs and normalised line breaks", async () => {
    const source = '  if (x < 2 && y > 1) {\r\n\tprint("value");  \r}\n';
    const document = documentWith([
      { id: "code", type: "codeBlock", language: "javascript", source },
    ]);
    const { paragraphs } = unpack(await generateDocx(document));
    expect(paragraphs).toHaveLength(1);
    expect(paragraphStyle(paragraphs[0]!)).toBe("CodeBlock");
    expect(text(paragraphs[0]!)).toBe(
      '  if (x < 2 && y > 1) {\n\tprint("value");  \n}\n',
    );
    expect(find(paragraphs, "w:br")).toHaveLength(3);
    for (const run of find(paragraphs, "w:t")) {
      expect(attributes(run)["xml:space"]).toBe("preserve");
    }
    for (const font of find(paragraphs, "w:rFonts")) {
      expect(attributes(font)["w:ascii"]).toBe("Courier New");
    }
  });

  it("uses accessible unsupported text before the description, never inserting original markup", async () => {
    const original = {
      format: "html",
      value: "<w:p><w:r><w:t>ORIGINAL_SECRET</w:t></w:r></w:p>",
    };
    const document = documentWith([
      {
        id: "accessible",
        type: "unsupported",
        description: "Hidden description",
        accessibleText: "Accessible <diagram> & text",
        original,
      },
      {
        id: "described",
        type: "unsupported",
        description: "Description fallback",
        original,
      },
    ]);
    const { paragraphs, files } = unpack(await generateDocx(document));
    expect(paragraphs.map(text)).toEqual([
      "Unsupported content: Accessible <diagram> & text",
      "Unsupported content: Description fallback",
    ]);
    expect(paragraphs.map(paragraphStyle)).toEqual(["ExportNote", "ExportNote"]);
    for (const bytes of Object.values(files)) {
      expect(strFromU8(bytes)).not.toContain("ORIGINAL_SECRET");
      expect(strFromU8(bytes)).not.toContain("Hidden description");
    }
  });

  it("never inserts answer annotations and does not mutate its input", async () => {
    const document = structuredClone(worksheetFixture());
    document.answers = [
      {
        id: "answer-1",
        targetId: "question-1",
        placement: "append",
        content: [paragraph("solution-1", "APPENDED_ANSWER_SECRET")],
      },
      {
        id: "answer-2",
        targetId: "question-2-response",
        placement: "replace-response",
        content: [paragraph("solution-2", "REPLACEMENT_ANSWER_SECRET")],
      },
    ];
    const valid = parseResourceDocument(document);
    const before = structuredClone(valid);
    const { files, body } = unpack(await generateDocx(valid, { embedFigures: false }));
    expect(select(body, "w:tbl").map((table) => rows(table).length)).toEqual([4, 6]);
    for (const bytes of Object.values(files))
      expect(strFromU8(bytes)).not.toMatch(/(?:APPENDED|REPLACEMENT)_ANSWER_SECRET/);
    expect(valid).toEqual(before);
  });

  it("sanitises XML-disallowed characters while retaining escaped text, Unicode and valid whitespace", async () => {
    const invalid = String.fromCharCode(0, 1, 8, 11, 12, 31, 0xd800, 0xffff);
    const document = documentWith([
      paragraph("text", `Before${invalid} <&> café 😀\t after\nnext`),
      { id: "code", type: "codeBlock", source: `Code${invalid} end` },
      {
        id: "unsupported",
        type: "unsupported",
        description: `Fallback${invalid} end`,
        original: { format: "text", value: "unused" },
      },
    ]);
    document.metadata.title = `Title${invalid} <&> 😀`;
    const before = structuredClone(document);
    const { paragraphs, part } = unpack(await generateDocx(document));
    expect(paragraphs.map(text)).toEqual([
      "Before <&> café 😀\t after\nnext",
      "Code end",
      "Unsupported content: Fallback end",
    ]);
    expect(text(one(part("docProps/core.xml"), "dc:title"))).toBe("Title <&> 😀");
    expect(document).toEqual(before);
  });
});

describe("DOCX question grouping", () => {
  type Layout = NonNullable<ResourceNode["layout"]>;

  function steps(prefix: string, count = 3): ResourceNode {
    return {
      id: `${prefix}-steps`,
      type: "section",
      children: Array.from({ length: count }, (_, index) =>
        paragraph(`${prefix}-step-${index + 1}`, `${prefix} step ${index + 1}`),
      ),
    };
  }

  function answer(
    prefix: string,
    kind: "box" | "lines" | "grid",
    lines = 4,
  ): ResourceNode {
    return {
      id: `${prefix}-answer`,
      type: "responseSpace",
      kind,
      ...(kind === "lines" ? { lines } : {}),
    };
  }

  function question(label: string, nodes: ResourceNode[]): ResourceNode {
    return { id: `question-${label}`, type: "question", label, children: nodes };
  }

  function withLayout(
    nodes: ResourceNode[],
    id: string,
    layout: Layout,
  ): ResourceNode[] {
    return nodes.map((node) => {
      if (node.id === id) return { ...node, layout };
      if (node.type === "section")
        return { ...node, children: withLayout(node.children, id, layout) };
      return node;
    });
  }

  async function exported(content: ResourceNode[]) {
    return unpack(await generateDocx(documentWith(content), { embedFigures: false }));
  }

  function keptNext(nodes: XmlNode[]): boolean[] {
    return nodes.map((node) => enabled([node], "w:keepNext").length > 0);
  }

  function beforeFirstTable(body: XmlNode[]): XmlNode[] {
    return body.slice(
      0,
      body.findIndex((node) => Object.hasOwn(node, "w:tbl")),
    );
  }

  it.each(["box", "lines", "grid"] as const)(
    "keeps a question's prompt and scaffold steps with the start of its %s",
    async (kind) => {
      const { body, paragraphs } = await exported([
        question("1", [
          paragraph("prompt", "Draw the ion."),
          steps("1"),
          answer("1", kind),
        ]),
      ]);

      const lead = beforeFirstTable(body);
      expect(lead.map(text)).toEqual([
        "Question 1",
        "Draw the ion.",
        "1 step 1",
        "1 step 2",
        "1 step 3",
      ]);
      expect(keptNext(lead)).toEqual(lead.map(() => true));
      const tableRows = rows(one(body, "w:tbl"));
      if (kind === "box") expect(tableRows).toHaveLength(1);
      for (const row of tableRows) {
        expect(enabled([row], "w:cantSplit")).toHaveLength(1);
        expect(enabled([row], "w:keepNext")).toHaveLength(0);
      }
      expect(keptNext([paragraphs.at(-1)!])).toEqual([false]);
      expect(enabled(body, "w:pageBreakBefore")).toHaveLength(0);
    },
  );

  it.each([
    {
      label: "defined terms",
      entries: [
        { term: inline("ion"), definition: inline("a charged particle") },
        { term: inline("shell"), definition: inline("an energy level") },
      ],
    },
    {
      label: "terms only",
      entries: [{ term: inline("ion") }, { term: inline("shell") }],
    },
  ])(
    "keeps every line of a word bank of $label with its answer",
    async ({ entries }) => {
      const { body } = await exported([
        question("1", [
          paragraph("prompt", "Explain how an ion forms."),
          {
            id: "1-bank",
            type: "definitionList",
            lead: inline("Vocabulary you could include:"),
            entries,
          },
          answer("1", "lines", 4),
        ]),
      ]);

      const lead = beforeFirstTable(body);
      expect(lead.length).toBeGreaterThan(4);
      expect(keptNext(lead)).toEqual(lead.map(() => true));
    },
  );

  it("keeps stacked scaffolds together with the answer", async () => {
    const { body } = await exported([
      question("1", [
        paragraph("prompt", "Explain how an ion forms."),
        {
          id: "1-starters",
          type: "section",
          children: [
            paragraph("1-starters-lead", "You could begin your answer like this:"),
            paragraph("1-starter-1", "Metals form positive ions because"),
          ],
        },
        {
          id: "1-bank",
          type: "definitionList",
          lead: inline("Vocabulary you could include:"),
          entries: [{ term: inline("ion") }, { term: inline("electron") }],
        },
        answer("1", "box"),
      ]),
    ]);

    const lead = beforeFirstTable(body);
    expect(lead.map(text)).toEqual([
      "Question 1",
      "Explain how an ion forms.",
      "You could begin your answer like this:",
      "Metals form positive ions because",
      "Vocabulary you could include:",
      "ion",
      "electron",
    ]);
    expect(keptNext(lead)).toEqual(lead.map(() => true));
  });

  it("keeps a whole definition list with following content when it asks to", async () => {
    const { paragraphs } = await exported([
      {
        id: "bank",
        type: "definitionList",
        entries: [
          { term: inline("ion"), definition: inline("a charged particle") },
          { term: inline("shell"), definition: inline("an energy level") },
        ],
        layout: { keepWithNext: true },
      },
      paragraph("after", "Following content"),
    ]);

    expect(keptNext(paragraphs)).toEqual([true, true, true, true, false]);
  });

  it("does not chain one question to the next", async () => {
    const { body } = await exported([
      question("1", [
        paragraph("1-prompt", "First prompt."),
        steps("1"),
        answer("1", "box"),
      ]),
      question("2", [
        paragraph("2-prompt", "Second prompt."),
        steps("2"),
        answer("2", "box"),
      ]),
    ]);

    const second = body.findIndex((node) => text(node) === "Question 2");
    const [box, spacer] = body.slice(second - 2, second);
    expect(Object.hasOwn(box!, "w:tbl")).toBe(true);
    expect(enabled([box!], "w:keepNext")).toHaveLength(0);
    expect(keptNext([spacer!, body[second]!])).toEqual([false, true]);
  });

  it.each([
    { label: "before the scaffold", id: "1-steps", layout: { breakBefore: "page" } },
    { label: "after the scaffold", id: "1-steps", layout: { breakAfter: "page" } },
    { label: "after a step", id: "1-step-1", layout: { breakAfter: "page" } },
    { label: "before the answer", id: "1-answer", layout: { breakBefore: "page" } },
  ] as const)(
    "ends the group at an explicit page break $label",
    async ({ id, layout }) => {
      const { body } = await exported([
        question(
          "1",
          withLayout(
            [paragraph("prompt", "Draw the ion."), steps("1"), answer("1", "box")],
            id,
            layout,
          ),
        ),
      ]);

      expect(enabled(body, "w:pageBreakBefore")).toHaveLength(1);
      const broken = body.findIndex(
        (node) => enabled([node], "w:pageBreakBefore").length > 0,
      );
      expect(keptNext([body[broken - 1]!])).toEqual([false]);
      expect(body.map(text).filter(Boolean)).toEqual([
        "Question 1",
        "Draw the ion.",
        "1 step 1",
        "1 step 2",
        "1 step 3",
      ]);
    },
  );

  it("lets one step opt out without unchaining the rest", async () => {
    const { paragraphs } = await exported([
      question(
        "1",
        withLayout(
          [paragraph("prompt", "Draw the ion."), steps("1", 4), answer("1", "box")],
          "1-step-2",
          { keepWithNext: false },
        ),
      ),
    ]);

    const lead = paragraphs.filter((node) => /^(Draw|1 step)/.test(text(node)));
    expect(keptNext(lead)).toEqual([true, true, false, true, true]);
  });

  it("keeps every paragraph of a step that holds display maths", async () => {
    const { body } = await exported([
      question("1", [
        paragraph("prompt", "Write the equation."),
        {
          id: "1-steps",
          type: "section",
          children: [
            {
              id: "1-step-1",
              type: "paragraph",
              content: [
                { type: "text", text: "Balance the charges:" },
                {
                  type: "math",
                  value: "Be \\rightarrow Be^{2+} + 2e^-",
                  display: true,
                },
                { type: "text", text: "then check both sides." },
              ],
            },
            paragraph("1-step-2", "1 step 2"),
          ],
        },
        answer("1", "box"),
      ]),
    ]);

    const lead = beforeFirstTable(body);
    expect(lead).toHaveLength(6);
    expect(keptNext(lead)).toEqual(lead.map(() => true));
  });

  it("chains through an empty section before the answer", async () => {
    const { body } = await exported([
      question("1", [
        paragraph("prompt", "Draw the ion."),
        steps("1"),
        { id: "empty", type: "section", children: [] },
        answer("1", "box"),
      ]),
    ]);

    const lead = beforeFirstTable(body);
    expect(lead).toHaveLength(5);
    expect(keptNext(lead)).toEqual(lead.map(() => true));
  });

  it("still emits the group, whole, for content longer than a page", async () => {
    const stem = Array.from({ length: 60 }, (_, index) =>
      paragraph(
        `1-stem-${index}`,
        `Stem paragraph ${index}: ${"long enough to fill most of a line. ".repeat(3).trim()}`,
      ),
    );
    const { body } = await exported([
      question("1", [...stem, steps("1", 5), answer("1", "lines", 40)]),
      question("2", [paragraph("2-prompt", "Second prompt."), answer("2", "box")]),
    ]);

    const [writing, box] = select(body, "w:tbl");
    const lead = body.slice(0, body.indexOf(writing!));
    expect(lead).toHaveLength(1 + 60 + 5);
    expect(keptNext(lead)).toEqual(lead.map(() => true));
    expect(rows(writing!)).toHaveLength(40);
    for (const row of rows(writing!))
      expect(enabled([row], "w:keepNext")).toHaveLength(0);
    const [boxRow] = rows(box!);
    expectRowHeight(boxRow!, 2400);
    expect(enabled([boxRow!], "w:cantSplit")).toHaveLength(1);
    expect(enabled(body, "w:pageBreakBefore")).toHaveLength(0);
  });
});
