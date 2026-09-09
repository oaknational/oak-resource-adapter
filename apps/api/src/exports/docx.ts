import type {
  Asset,
  InlineContent,
  ResourceDocument,
  ResourceNode,
  TableCell as ResourceTableCell,
} from "@oaknational/resource-document";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  Tab,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
} from "docx";

import { createRemoteImageLoader, type ExportImage, type ImageLoader } from "./images";
import { assertExportLimits } from "./limits";
import { readableMathText } from "./math-text";
import {
  calloutLabel,
  introducedByPrompt,
  missingImageText,
  questionHeading,
  responseSpaceLayout,
  unsupportedText,
} from "./model";
import { tableColumnWidths } from "./table-widths";

type Block = Paragraph | Table;
const bodyFont = "Lexend";
const normalRun = {
  font: bodyFont,
  size: 22,
  bold: false,
  italics: false,
  color: "000000",
};
const normalParagraph = {
  alignment: AlignmentType.LEFT,
  spacing: { before: 0, after: 120, line: 276 },
  outlineLevel: 9,
  keepNext: false,
  keepLines: false,
};
const pageWidth = 11906;
const pageHeight = 16838;
const margin = 1134;
const contentWidth = pageWidth - margin * 2;
const contentHeight = pageHeight - margin * 2;
const writingLineHeight = 400;
const gridCellSize = 400;
const responseSpaceGeometry = { width: contentWidth, cellSize: gridCellSize };
const twipsPerPixel = 15;
const maxImagePixelHeight = 600;
const maxHeadingLevel = 9;
const rule = { style: BorderStyle.SINGLE, size: 4, color: "777777" } as const;
const noRule = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

export interface DocxOptions {
  embedFigures?: boolean;
  imageLoader?: ImageLoader;
}

function xmlText(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      );
    })
    .join("");
}

function textRun(part: string, options: IRunOptions): TextRun {
  if (part === "\n") return new TextRun({ ...options, break: 1 });
  if (part === "\t") return new TextRun({ ...options, children: [new Tab()] });
  return new TextRun({ ...options, text: part });
}

function textRuns(text: string, options: IRunOptions = {}): TextRun[] {
  const parts = xmlText(text)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split(/([\n\t])/)
    .filter((part) => part !== "");
  return (parts.length ? parts : [""]).map((part) => textRun(part, options));
}

interface InlineParagraphOptions extends IParagraphOptions {
  /** Keep every paragraph but the last with the one after it. */
  chain?: boolean;
}

function inlineParagraphs(
  content: InlineContent,
  options: InlineParagraphOptions = {},
  runOptions: IRunOptions = {},
): Paragraph[] {
  const { chain = false, ...paragraphOptions } = options;
  const paragraphs: IParagraphOptions[] = [];
  let runs: TextRun[] = [];
  const flush = () => {
    if (runs.length) {
      paragraphs.push({ style: "Normal", ...paragraphOptions, children: runs });
      runs = [];
    }
  };
  for (const run of content) {
    if (run.type === "math" && run.display) {
      flush();
      paragraphs.push({
        style: "Normal",
        ...paragraphOptions,
        alignment: AlignmentType.CENTER,
        children: textRuns(readableMathText(run.value), {
          ...runOptions,
          font: "Cambria",
        }),
      });
    } else {
      runs.push(
        ...textRuns(
          run.type === "text" ? run.text : readableMathText(run.value),
          runOptions,
        ),
      );
    }
  }
  flush();
  return paragraphs.map(
    (paragraph, index) =>
      new Paragraph({
        ...paragraph,
        ...(chain && index < paragraphs.length - 1 ? { keepNext: true } : {}),
      }),
  );
}

function label(text: string, options: IParagraphOptions = {}): Paragraph {
  return new Paragraph({ style: "Normal", ...options, children: textRuns(text) });
}

function captionParagraphs(
  content: InlineContent,
  options: Readonly<{ credited: boolean; keepWithFollowing: boolean }>,
): Paragraph[] {
  return inlineParagraphs(content, {
    style: "Caption",
    keepNext: options.credited || options.keepWithFollowing,
    spacing: { before: 40, after: options.credited ? 40 : 160 },
    chain: true,
  });
}

function heading(level: number): string {
  return `Heading${Math.min(Math.max(level, 1), maxHeadingLevel)}`;
}

/**
 * A model heading inside a question must sit below the heading the exporter
 * invented for that question, or Word's outline puts question content outside
 * its question. Raising rather than offsetting the level avoids outline gaps.
 */
function headingLevel(enclosingQuestionLevel: number, level: number): number {
  return Math.min(Math.max(enclosingQuestionLevel + 1, level), maxHeadingLevel);
}

function spacer(keepNext: boolean): Paragraph {
  return new Paragraph({
    style: "Normal",
    keepNext,
    spacing: { before: 0, after: 80 },
  });
}

function headingStyle(level: number) {
  return {
    name: `Heading ${level}`,
    basedOn: "Normal",
    next: "Normal",
    quickFormat: true,
    run: {
      font: bodyFont,
      bold: true,
      italics: false,
      color: "000000",
      size: Math.max(22, 34 - level * 2),
    },
    paragraph: {
      outlineLevel: level - 1,
      keepNext: true,
      keepLines: true,
      spacing: { before: 240, after: 120 },
    },
  };
}

function responseSpace(
  node: Extract<ResourceNode, { type: "responseSpace" }>,
  keepNext: boolean,
): Block[] {
  const width =
    node.layout?.preferredWidth === "half"
      ? Math.floor(contentWidth / 2)
      : contentWidth;
  const { rows, columns, units } = responseSpaceLayout(node, {
    width,
    cellSize: gridCellSize,
  });
  const tableWidth = node.kind === "grid" ? columns * gridCellSize : width;
  return [
    new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: Array.from({ length: columns }, () => tableWidth / columns),
      layout: TableLayoutType.FIXED,
      borders: {
        top: node.kind === "lines" ? noRule : rule,
        bottom: rule,
        left: node.kind === "lines" ? noRule : rule,
        right: node.kind === "lines" ? noRule : rule,
        insideHorizontal: rule,
        insideVertical: node.kind === "grid" ? rule : noRule,
      },
      rows: Array.from(
        { length: rows },
        (_, rowIndex) =>
          new TableRow({
            cantSplit: true,
            height: {
              value:
                node.kind === "box"
                  ? // An unsplittable row taller than the page cannot be laid out.
                    Math.min(units * writingLineHeight, contentHeight)
                  : gridCellSize,
              rule: HeightRule.ATLEAST,
            },
            children: Array.from(
              { length: columns },
              () =>
                new TableCell({
                  margins: { top: 0, bottom: 0, left: 40, right: 40 },
                  children: [
                    new Paragraph({
                      style: "Normal",
                      keepNext: keepNext && rowIndex === rows - 1,
                      spacing: { before: 0, after: 0 },
                      children: [],
                    }),
                  ],
                }),
            ),
          }),
      ),
    }),
    spacer(keepNext),
  ];
}

function cellContent(
  cell: ResourceTableCell,
  isHeader: boolean,
  keepNext: boolean,
): Paragraph[] {
  switch (cell.kind) {
    case "content":
      return inlineParagraphs(cell.content, { keepNext }, { bold: isHeader });
    case "answer":
    case "empty":
      return [new Paragraph({ style: "Normal", keepNext })];
  }
}

function table(
  node: Extract<ResourceNode, { type: "table" }>,
  options: Readonly<{ keepNext: boolean; keepLines: boolean }>,
): Block[] {
  const rows = [...(node.header ? [node.header] : []), ...node.rows];
  const columnWidths = tableColumnWidths(rows, contentWidth);
  return [
    new Table({
      width: { size: contentWidth, type: WidthType.DXA },
      columnWidths,
      layout: TableLayoutType.FIXED,
      rows: rows.map(
        (row, index) =>
          new TableRow({
            tableHeader: Boolean(node.header) && index === 0,
            cantSplit: options.keepLines,
            height: { value: writingLineHeight, rule: HeightRule.ATLEAST },
            children: row.map(
              (cell, column) =>
                new TableCell({
                  width: { size: columnWidths[column]!, type: WidthType.DXA },
                  margins: { left: 100, right: 100 },
                  children: cellContent(
                    cell,
                    Boolean(node.header) && index === 0,
                    options.keepNext && index === rows.length - 1,
                  ),
                }),
            ),
          }),
      ),
    }),
    spacer(options.keepNext),
  ];
}

function imageParagraph(
  node: Extract<ResourceNode, { type: "figure" }>,
  image: ExportImage,
  alternativeText: string,
  keepNext: boolean,
): Paragraph {
  const maxWidth =
    (node.layout?.preferredWidth === "half" ? contentWidth / 2 : contentWidth) /
    twipsPerPixel;
  const scale = Math.min(1, maxWidth / image.width, maxImagePixelHeight / image.height);
  return new Paragraph({
    style: "Normal",
    keepNext,
    children: [
      new ImageRun({
        data: image.data,
        type: image.type,
        transformation: {
          width: Math.max(1, Math.round(image.width * scale)),
          height: Math.max(1, Math.round(image.height * scale)),
        },
        altText: { name: "Figure", title: "", description: xmlText(alternativeText) },
      }),
    ],
  });
}

function placeholderParagraph(
  node: Extract<ResourceNode, { type: "figure" }>,
  alternativeText: string | undefined,
  keepNext: boolean,
): Paragraph {
  return new Paragraph({
    style: "MissingImage",
    keepNext,
    ...(node.layout?.preferredWidth === "half"
      ? { indent: { right: Math.floor(contentWidth / 2) } }
      : {}),
    children: [
      ...textRuns(missingImageText, { bold: true }),
      ...(alternativeText === undefined
        ? []
        : [new TextRun({ break: 1 }), ...textRuns(alternativeText)]),
    ],
  });
}

async function figure(
  node: Extract<ResourceNode, { type: "figure" }>,
  context: RenderContext,
  options: Readonly<{ keepNext: boolean }>,
): Promise<Block[]> {
  const asset = context.assets.get(node.assetId);
  const keepWithFollowing = options.keepNext;
  // The library has no decorative-image flag; omit decoration rather than inventing alt text.
  if (asset?.alternative.kind === "decorative") {
    return node.caption
      ? captionParagraphs(node.caption, { credited: false, keepWithFollowing })
      : [];
  }
  const image =
    asset?.alternative.kind === "text" && context.loader
      ? await context.loader(asset).catch(() => undefined)
      : undefined;
  const credited = Boolean(asset?.credit);
  const alternativeText =
    asset?.alternative.kind === "text" ? asset.alternative.text : undefined;
  // The figure's own group holds together whatever the external hint asks for.
  const keepNext = Boolean(node.caption) || credited || keepWithFollowing;
  const blocks: Block[] = [
    image && alternativeText !== undefined
      ? imageParagraph(node, image, alternativeText, keepNext)
      : placeholderParagraph(node, alternativeText, keepNext),
  ];
  if (node.caption)
    blocks.push(...captionParagraphs(node.caption, { credited, keepWithFollowing }));
  if (asset?.credit)
    blocks.push(
      label(`Credit: ${asset.credit}`, {
        style: "ImageCredit",
        keepNext: keepWithFollowing,
      }),
    );
  return blocks;
}

interface RenderContext {
  assets: ReadonlyMap<string, Asset>;
  loader: ImageLoader | undefined;
  enclosingQuestionLevel: number;
  parentHeading: number;
  insideQuestion: boolean;
  // Shared so a break after the last child of a section reaches the next sibling.
  pendingPageBreak: { value: boolean };
}

function pageBreak(): Paragraph {
  return new Paragraph({
    style: "Normal",
    pageBreakBefore: true,
    spacing: { before: 0, after: 0 },
  });
}

function consumePageBreak(blocks: Block[], context: RenderContext): Block[] {
  if (blocks.length === 0 || !context.pendingPageBreak.value) return blocks;
  context.pendingPageBreak.value = false;
  return [pageBreak(), ...blocks];
}

async function renderNodes(
  nodes: readonly ResourceNode[],
  context: RenderContext,
): Promise<Block[]> {
  const blocks: Block[] = [];
  let currentHeading = context.parentHeading;
  for (const [index, node] of nodes.entries()) {
    const next = nodes[index + 1];
    const keepWithFollowingContent =
      context.insideQuestion &&
      next !== undefined &&
      introducedByPrompt(next) &&
      node.layout?.breakAfter !== "page" &&
      next.layout?.breakBefore !== "page";
    if (node.layout?.breakBefore === "page") context.pendingPageBreak.value = true;
    const rendered = await renderNode(
      node,
      { ...context, parentHeading: currentHeading },
      keepWithFollowingContent,
    );
    // Containers consume the pending break at their first rendered descendant.
    blocks.push(
      ...(node.type === "section" || node.type === "question"
        ? rendered
        : consumePageBreak(rendered, context)),
    );
    if (node.type === "heading") {
      currentHeading = headingLevel(context.enclosingQuestionLevel, node.level);
    }
    if (node.layout?.breakAfter === "page") context.pendingPageBreak.value = true;
  }
  return blocks;
}

async function renderNode(
  node: ResourceNode,
  context: RenderContext,
  keepWithFollowingContent = false,
): Promise<Block[]> {
  const keepNext = node.layout?.keepWithNext ?? keepWithFollowingContent;
  const paragraphOptions: IParagraphOptions = {
    keepLines: node.layout?.keepTogether ?? false,
    keepNext,
  };
  switch (node.type) {
    case "section":
      return renderNodes(node.children, context);
    case "heading":
      return inlineParagraphs(node.content, {
        ...paragraphOptions,
        style: heading(headingLevel(context.enclosingQuestionLevel, node.level)),
        keepNext: true,
      });
    case "paragraph":
      return inlineParagraphs(node.content, paragraphOptions);
    case "callout":
      return inlineParagraphs(
        [{ type: "text", text: calloutLabel(node.role) }, ...node.content],
        { ...paragraphOptions, style: "Callout" },
      );
    case "question": {
      const questionLevel = Math.min(context.parentHeading + 1, maxHeadingLevel);
      const headingBlocks = consumePageBreak(
        [
          label(questionHeading(node), {
            style: heading(questionLevel),
            keepNext: true,
          }),
        ],
        context,
      );
      return [
        ...headingBlocks,
        ...(await renderNodes(node.children, {
          ...context,
          enclosingQuestionLevel: questionLevel,
          parentHeading: questionLevel,
          insideQuestion: true,
        })),
      ];
    }
    case "definitionList":
      return [
        ...(node.lead ? inlineParagraphs(node.lead, paragraphOptions) : []),
        ...node.entries.flatMap((entry) => [
          ...inlineParagraphs(
            entry.term,
            { keepNext: Boolean(entry.definition || entry.example) },
            { bold: true },
          ),
          ...(entry.definition
            ? inlineParagraphs(entry.definition, { indent: { left: 240 } })
            : []),
          ...(entry.example
            ? inlineParagraphs(
                [{ type: "text", text: "Example: " }, ...entry.example],
                { indent: { left: 240 } },
              )
            : []),
        ]),
      ];
    case "responseSpace":
      return responseSpace(node, keepNext);
    case "figure":
      return figure(node, context, { keepNext });
    case "table":
      return table(node, {
        keepNext,
        keepLines: node.layout?.keepTogether ?? false,
      });
    case "codeBlock":
      return [
        new Paragraph({
          ...paragraphOptions,
          style: "CodeBlock",
          children: textRuns(node.source, { font: "Courier New" }),
        }),
      ];
    case "unsupported":
      return [
        label(unsupportedText(node), {
          ...paragraphOptions,
          style: "ExportNote",
        }),
      ];
    default:
      return assertNever(node);
  }
}

function assertNever(node: never): never {
  throw new Error(`Unknown resource node: ${String(node)}`);
}

export async function generateDocx(
  document: ResourceDocument,
  options: DocxOptions = {},
): Promise<Uint8Array> {
  assertExportLimits(document, responseSpaceGeometry);
  const loader =
    options.embedFigures === false
      ? undefined
      : (options.imageLoader ?? createRemoteImageLoader());
  const children = await renderNodes(document.content, {
    assets: new Map(document.assets.map((asset) => [asset.id, asset])),
    loader,
    enclosingQuestionLevel: 0,
    parentHeading: 0,
    insideQuestion: false,
    pendingPageBreak: { value: false },
  });
  const file = new Document({
    title: xmlText(document.metadata.title ?? "Untitled resource"),
    creator: "Oak National Academy",
    styles: {
      default: {
        document: {
          run: { ...normalRun, language: { value: document.language } },
          paragraph: normalParagraph,
        },
        heading1: headingStyle(1),
        heading2: headingStyle(2),
        heading3: headingStyle(3),
        heading4: headingStyle(4),
        heading5: headingStyle(5),
        heading6: headingStyle(6),
      },
      paragraphStyles: [
        // Importers need a concrete base style, not just document defaults.
        {
          id: "Normal",
          name: "Normal",
          next: "Normal",
          quickFormat: true,
          run: normalRun,
          paragraph: normalParagraph,
        },
        ...[7, 8, 9].map((level) => ({ id: heading(level), ...headingStyle(level) })),
        {
          id: "Callout",
          name: "Callout",
          basedOn: "Normal",
          paragraph: {
            shading: { fill: "F2F2F2" },
            border: { left: rule },
          },
        },
        {
          id: "MissingImage",
          name: "Missing image",
          basedOn: "Normal",
          run: { size: 20, color: "555555" },
          paragraph: {
            alignment: AlignmentType.CENTER,
            keepLines: true,
            spacing: { before: 240, after: 240, line: 276 },
            shading: { fill: "F2F2F2" },
            border: {
              top: { ...rule, style: BorderStyle.DASHED, space: 10 },
              bottom: { ...rule, style: BorderStyle.DASHED, space: 10 },
              left: { ...rule, style: BorderStyle.DASHED, space: 10 },
              right: { ...rule, style: BorderStyle.DASHED, space: 10 },
            },
          },
        },
        {
          id: "ExportNote",
          name: "Export note",
          basedOn: "Normal",
          run: { italics: true },
        },
        {
          id: "CodeBlock",
          name: "Code block",
          basedOn: "Normal",
          run: { font: "Courier New", size: 20 },
        },
        {
          id: "Caption",
          name: "Caption",
          basedOn: "Normal",
          run: {
            font: bodyFont,
            bold: false,
            italics: true,
            size: 20,
            color: "555555",
          },
          paragraph: {
            spacing: { before: 40, after: 160, line: 240 },
            keepLines: true,
          },
        },
        {
          id: "ImageCredit",
          name: "Image credit",
          basedOn: "Normal",
          run: {
            font: bodyFont,
            bold: false,
            italics: false,
            size: 18,
            color: "666666",
          },
          paragraph: { spacing: { before: 0, after: 160, line: 240 }, keepLines: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: pageWidth, height: pageHeight },
            margin: { top: margin, bottom: margin, left: margin, right: margin },
          },
        },
        children: children.length ? children : [new Paragraph({ style: "Normal" })],
      },
    ],
  });
  return Packer.toBuffer(file);
}
