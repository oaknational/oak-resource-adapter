import type { ResourceDocument, ResourceNode } from "@oaknational/resource-document";

import { responseSpaceLayout, responseSpaceUnits } from "./model";

const maxResponseSpaceUnits = 100;
const maxNodes = 5000;
const maxDepth = 50;
const maxCells = 20_000;

type Geometry = Readonly<{ width: number; cellSize: number }>;

export class ExportLimitError extends Error {
  constructor() {
    super("The resource exceeds export limits.");
  }
}

/** Table cells, writing cells and definition entries one node expands into. */
function expansionCells(node: ResourceNode, geometry: Geometry): number {
  if (node.type === "responseSpace") {
    if (responseSpaceUnits(node) > maxResponseSpaceUnits) throw new ExportLimitError();
    const { rows, columns } = responseSpaceLayout(node, geometry);
    return rows * columns;
  }
  if (node.type === "table") {
    // Summed rather than rows x first row: never assume the table is rectangular.
    return node.rows.reduce(
      (count, row) => count + row.length,
      node.header?.length ?? 0,
    );
  }
  if (node.type === "definitionList") {
    return node.entries.length;
  }
  return 0;
}

// Small JSON inputs can expand into enormous tables or deeply recursive traversals.
export function assertExportLimits(
  document: ResourceDocument,
  geometry: Geometry,
): void {
  const pending = document.content.map((node) => ({ node, depth: 1 }));
  let nodes = 0;
  let cells = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++nodes > maxNodes || depth > maxDepth) throw new ExportLimitError();
    if ("children" in node) {
      pending.push(
        ...node.children.map((child: ResourceNode) => ({
          node: child,
          depth: depth + 1,
        })),
      );
    }
    cells += expansionCells(node, geometry);
    if (cells > maxCells) throw new ExportLimitError();
  }
}
