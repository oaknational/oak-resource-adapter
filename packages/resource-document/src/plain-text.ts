import type {
  Asset,
  AssetAlternative,
  InlineContent,
  ResourceDocument,
  ResourceNode,
  TableCell,
} from "./schema/types.js";
import {
  walkNodes,
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
    case "task":
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

function joinLines(lines: readonly string[]): string {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}

function assetsById(assets: readonly Asset[]): ReadonlyMap<string, Asset> {
  return new Map(assets.map((asset) => [asset.id, asset]));
}

/** Flattens a document to the text a reader would see, one piece per line, in reading order. */
export function resourceDocumentToPlainText(
  document: ResourceDocument,
  options: ResourceDocumentTraversalOptions = {},
): string {
  const assets = assetsById(document.assets);
  const title = document.metadata.title ?? "";
  const nodeLines = Array.from(walkResourceDocument(document, options), (node) =>
    nodeText(node, assets),
  ).flat();

  return joinLines([title, ...nodeLines]);
}

/** Flattens the given nodes and their descendants the same way, without the document title. */
export function resourceNodesToPlainText(
  nodes: readonly ResourceNode[],
  assets: readonly Asset[],
): string {
  const byId = assetsById(assets);
  return joinLines(Array.from(walkNodes(nodes), (node) => nodeText(node, byId)).flat());
}
