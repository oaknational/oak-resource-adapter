// Format-independent readings of the resource model. A second exporter must
// reproduce these decisions identically, so they do not belong in a renderer.

import type { ResourceNode } from "@oaknational/resource-document";

const calloutLabels = {
  "learning-objective": "Learning objective",
  instruction: "Instructions",
  note: "Note",
  warning: "Warning",
} as const;

const responseSpaceDefaults = { lines: 4, box: 6, grid: 6 } as const;

type ResponseSpaceNode = Extract<ResourceNode, { type: "responseSpace" }>;

export const missingImageText = "Image unavailable in this document";

export function calloutLabel(role: keyof typeof calloutLabels): string {
  return `${calloutLabels[role]}: `;
}

export function questionHeading(
  node: Extract<ResourceNode, { type: "question" }>,
): string {
  const parts = ["Question"];
  if (node.label) parts.push(node.label);
  if (node.marks !== undefined) {
    parts.push(`(${node.marks} ${node.marks === 1 ? "mark" : "marks"})`);
  }
  return parts.join(" ");
}

export function unsupportedText(
  node: Extract<ResourceNode, { type: "unsupported" }>,
): string {
  return `Unsupported content: ${node.accessibleText ?? node.description}`;
}

export function responseSpaceUnits(node: ResponseSpaceNode): number {
  return node.lines ?? responseSpaceDefaults[node.kind];
}

/**
 * Grid columns depend on the page geometry the caller renders at, so both the
 * renderer and the output-expansion limit must derive them from the same width.
 */
export function responseSpaceLayout(
  node: ResponseSpaceNode,
  geometry: Readonly<{ width: number; cellSize: number }>,
): Readonly<{ rows: number; columns: number; units: number }> {
  const units = responseSpaceUnits(node);
  return {
    units,
    rows: node.kind === "box" ? 1 : units,
    columns:
      node.kind === "grid"
        ? Math.max(1, Math.floor(geometry.width / geometry.cellSize))
        : 1,
  };
}

/** Content a question prompt introduces, and should not be separated from. */
function introducedByPrompt(node: ResourceNode): boolean {
  return (
    node.type === "responseSpace" ||
    node.type === "table" ||
    node.type === "figure" ||
    node.type === "codeBlock"
  );
}

type Leaf = { node: ResourceNode; breakAfter: boolean };

/** A question's content in reading order through its sections, with its page breaks. */
function leavesOf(nodes: readonly ResourceNode[], leaves: Leaf[] = []): Leaf[] {
  const breakAfterLast = () => {
    const last = leaves.at(-1);
    if (last) last.breakAfter = true;
  };
  for (const node of nodes) {
    if (node.layout?.breakBefore === "page") breakAfterLast();
    if (node.type === "section") leavesOf(node.children, leaves);
    else leaves.push({ node, breakAfter: false });
    if (node.layout?.breakAfter === "page") breakAfterLast();
  }
  return leaves;
}

/**
 * An answer space never sticks to the next part, or every part of a
 * multi-part question would be held on one page.
 */
export function keptWithFollowingContent(
  question: Extract<ResourceNode, { type: "question" }>,
): ReadonlySet<ResourceNode> {
  const leaves = leavesOf(question.children);
  const kept = new Set<ResourceNode>();
  let followingKept = false;
  for (let index = leaves.length - 1; index >= 0; index -= 1) {
    const { node, breakAfter } = leaves[index]!;
    const next = leaves[index + 1]?.node;
    const keep: boolean =
      next !== undefined &&
      !breakAfter &&
      (introducedByPrompt(next) || (node.type !== "responseSpace" && followingKept));
    if (keep) kept.add(node);
    followingKept = keep;
  }
  return kept;
}
