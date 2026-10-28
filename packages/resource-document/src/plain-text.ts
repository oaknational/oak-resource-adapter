import type {
  Asset,
  AssetAlternative,
  InlineContent,
  ResourceDocument,
  ResourceNode,
  TableCell,
} from "./schema/types.js";
import {
  walkResourceDocument,
  type ResourceDocumentTraversalOptions,
} from "./traversal.js";

function inlineText(content: InlineContent | undefined): string {
  return (content ?? [])
    .map((run): string => {
      switch (run.type) {
        case "text":
          return run.text;
        case "math":
          return run.value;
      }
    })
    .join("");
}

function cellText(cell: TableCell): string {
  switch (cell.kind) {
    case "content":
      return inlineText(cell.content);
    case "answer":
    case "empty":
      return "";
  }
}

function alternativeText(alternative: AssetAlternative): string {
  switch (alternative.kind) {
    case "text":
      return alternative.text;
    case "decorative":
    case "missing":
      return "";
  }
}

function nodeText(node: ResourceNode, assets: ReadonlyMap<string, Asset>): string[] {
  switch (node.type) {
    case "section":
      return [];
    case "question":
      return [node.label ?? ""];
    case "heading":
    case "paragraph":
    case "callout":
      return [inlineText(node.content)];
    case "definitionList":
      return [
        inlineText(node.lead),
        ...node.entries.flatMap(({ definition, example, term }) => [
          inlineText(term),
          inlineText(definition),
          inlineText(example),
        ]),
      ];
    case "responseSpace":
      return [];
    case "figure": {
      const asset = assets.get(node.assetId);
      return [
        inlineText(node.caption),
        asset === undefined ? "" : alternativeText(asset.alternative),
      ];
    }
    case "table":
      return [...(node.header ?? []), ...node.rows.flat()].map(cellText);
    case "codeBlock":
      return [node.source];
    case "unsupported":
      return [node.description, node.accessibleText ?? ""];
  }
}

/** Flattens a document to the text a reader would see, one piece per line, in reading order. */
export function resourceDocumentToPlainText(
  document: ResourceDocument,
  options: ResourceDocumentTraversalOptions = {},
): string {
  const assets = new Map(document.assets.map((asset) => [asset.id, asset]));
  const title = document.metadata.title ?? "";
  const nodeLines = Array.from(walkResourceDocument(document, options), (node) =>
    nodeText(node, assets),
  ).flat();

  return [title, ...nodeLines]
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}
