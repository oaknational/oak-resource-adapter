import type { ResourceDocument, ResourceNode } from "@oaknational/resource-document";

import { responseSpaceLayout, responseSpaceUnits } from "./model";

const maxResponseSpaceUnits = 100;

export class ExportLimitError extends Error {
  constructor() {
    super("The resource exceeds export limits.");
  }
}

// Small JSON inputs can expand into enormous tables or deeply recursive traversals.
export function assertExportLimits(
  document: ResourceDocument,
  geometry: Readonly<{ width: number; cellSize: number }>,
): void {
  const pending = document.content.map((node) => ({ node, depth: 1 }));
  let nodes = 0;
  let cells = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++nodes > 5000 || depth > 50) throw new ExportLimitError();
    if ("children" in node) {
      pending.push(
        ...node.children.map((child: ResourceNode) => ({
          node: child,
          depth: depth + 1,
        })),
      );
    }
    if (node.type === "responseSpace") {
      if (responseSpaceUnits(node) > maxResponseSpaceUnits)
        throw new ExportLimitError();
      const { rows, columns } = responseSpaceLayout(node, geometry);
      cells += rows * columns;
    }
    if (node.type === "table") {
      cells += (node.rows.length + (node.header ? 1 : 0)) * (node.rows[0]?.length ?? 0);
    }
    if (node.type === "definitionList") cells += node.entries.length;
    if (cells > 20_000) throw new ExportLimitError();
  }
}
