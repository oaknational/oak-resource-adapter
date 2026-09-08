import { loadOriginalResourceDocumentFixture } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import type {
  Asset,
  InlineContent,
  ResourceDocument,
  ResourceNode,
} from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";
import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeAll, beforeEach, expect, vi } from "vitest";

export interface XmlNode {
  [name: string]: XmlNode[] | Record<string, string> | string | undefined;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});
const fetchGuard = vi.fn<typeof fetch>();
export const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
    "base64",
  ),
);
let fixture: ResourceDocument;

export function children(node: XmlNode): XmlNode[] {
  return Object.values(node).flatMap((value) => (Array.isArray(value) ? value : []));
}

export function select(nodes: XmlNode[], tag: string): XmlNode[] {
  return nodes.filter((node) => Object.hasOwn(node, tag));
}

export function find(nodes: XmlNode[], tag: string): XmlNode[] {
  return nodes.flatMap((node) => [
    ...select([node], tag),
    ...find(children(node), tag),
  ]);
}

export function one(nodes: XmlNode[], tag: string): XmlNode {
  const matches = find(nodes, tag);
  expect(matches, tag).toHaveLength(1);
  return matches[0]!;
}

export function attributes(node: XmlNode): Record<string, string> {
  return (node[":@"] as Record<string, string>) ?? {};
}

export function text(node: XmlNode): string {
  if (typeof node["#text"] === "string") return node["#text"];
  if (Object.hasOwn(node, "w:br")) return "\n";
  if (Object.hasOwn(node, "w:tab")) return "\t";
  return children(node).map(text).join("");
}

export function paragraphStyle(node: XmlNode): string | undefined {
  const style = find([node], "w:pStyle")[0];
  return style ? attributes(style)["w:val"] : undefined;
}

export function enabled(nodes: XmlNode[], tag: string): XmlNode[] {
  return find(nodes, tag).filter(
    (node) => !["false", "0", "off"].includes(attributes(node)["w:val"] ?? "true"),
  );
}

export function unpack(bytes: Uint8Array) {
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  const files = unzipSync(bytes);
  const parts = new Map<string, XmlNode[]>();
  for (const [name, data] of Object.entries(files)) {
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    const xml = strFromU8(data);
    expect(() => SyntaxValidator.validate(xml), name).not.toThrow();
    parts.set(name, parser.parse(xml) as XmlNode[]);
  }
  function part(name: string): XmlNode[] {
    expect(parts.has(name), `Missing OOXML part: ${name}`).toBe(true);
    return parts.get(name)!;
  }
  one(part("[Content_Types].xml"), "Types");
  const rootRelationships = find(part("_rels/.rels"), "Relationship");
  expect(
    rootRelationships.some(
      (node) =>
        attributes(node).Type?.endsWith("/officeDocument") &&
        attributes(node).Target === "word/document.xml",
    ),
  ).toBe(true);
  const body = children(one(part("word/document.xml"), "w:body"));
  one(part("word/styles.xml"), "w:styles");
  one(part("docProps/core.xml"), "cp:coreProperties");
  part("word/_rels/document.xml.rels");
  return { files, part, body, paragraphs: select(body, "w:p") };
}

export function inline(value: string): InlineContent {
  return [{ type: "text", text: value }];
}

export function paragraph(id: string, value: string): ResourceNode {
  return { id, type: "paragraph", content: inline(value) };
}

export function documentWith(
  content: ResourceNode[],
  assets: Asset[] = [],
): ResourceDocument {
  const document = structuredClone(fixture);
  document.content = content;
  document.assets = assets;
  document.answers = [];
  document.diagnostics = [];
  delete document.sourceMap;
  return parseResourceDocument(document);
}

export function imageDocument(
  alternative: Asset["alternative"] = {
    kind: "text",
    text: 'A scale: x < 4 & "balanced".',
    origin: "authored",
  },
  preferredWidth: "full" | "half" = "full",
) {
  return documentWith(
    [
      {
        id: "figure",
        type: "figure",
        assetId: "image",
        caption: inline("Figure caption"),
        layout: { preferredWidth },
      },
    ],
    [
      {
        id: "image",
        mediaType: "image/png",
        contentRef: "https://images.example.test/tiny.png",
        alternative,
        credit: "Test illustrator",
      },
    ],
  );
}

export function mediaFiles(files: Record<string, Uint8Array>): string[] {
  return Object.keys(files).filter(
    (name) => name.startsWith("word/media/") && !name.endsWith("/"),
  );
}

export function rows(table: XmlNode): XmlNode[] {
  return select(children(table), "w:tr");
}

export function expectRowHeight(row: XmlNode, height: number) {
  expect(attributes(one([row], "w:trHeight"))).toMatchObject({
    "w:val": String(height),
    "w:hRule": "atLeast",
  });
}

/** The checked-in worksheet the synthetic document builders start from. */
export function worksheetFixture(): ResourceDocument {
  return fixture;
}

export function setupDocxTests(): void {
  beforeAll(async () => {
    fixture = (await loadOriginalResourceDocumentFixture("linear-equations-smoke"))
      .expectedDocument;
  });

  beforeEach(() => {
    fetchGuard.mockReset().mockImplementation(() => {
      throw new Error("Unexpected network access during DOCX export");
    });
    vi.stubGlobal("fetch", fetchGuard);
    vi.stubEnv("EXPORT_IMAGE_ALLOWED_ORIGINS", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    expect(fetchGuard).not.toHaveBeenCalled();
  });
}
