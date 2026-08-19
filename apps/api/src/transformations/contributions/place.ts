import type { ResourceDocument, ResourceNode } from "@oaknational/resource-document";

function hasChildren(
  node: ResourceNode,
): node is Extract<ResourceNode, { children: ResourceNode[] }> {
  return node.type === "question" || node.type === "section";
}

/**
 * Beneath the instruction rather than beneath the whole task: a pupil should
 * meet the support before the space they write in.
 */
function withinChildren(
  children: readonly ResourceNode[],
  node: ResourceNode,
): ResourceNode[] {
  const responseSpace = children.findIndex((child) => child.type === "responseSpace");

  return responseSpace === -1
    ? [...children, node]
    : [...children.slice(0, responseSpace), node, ...children.slice(responseSpace)];
}

function beneathTarget(
  nodes: readonly ResourceNode[],
  node: ResourceNode,
  targetBlockId: string,
): ResourceNode[] | undefined {
  const index = nodes.findIndex((candidate) => candidate.id === targetBlockId);
  const target = index === -1 ? undefined : nodes[index];

  if (target !== undefined) {
    return hasChildren(target)
      ? nodes.with(index, {
          ...target,
          children: withinChildren(target.children, node),
        })
      : [...nodes.slice(0, index + 1), node, ...nodes.slice(index + 1)];
  }

  for (const [position, candidate] of nodes.entries()) {
    if (!hasChildren(candidate)) {
      continue;
    }

    const children = beneathTarget(candidate.children, node, targetBlockId);

    if (children !== undefined) {
      return nodes.with(position, { ...candidate, children });
    }
  }

  return undefined;
}

/**
 * Copies the document with `node` placed beneath its target, or at the end when
 * the contribution applies to the whole document.
 */
export function insertBeneath(
  document: ResourceDocument,
  node: ResourceNode,
  targetBlockId: string | undefined,
): ResourceDocument {
  if (targetBlockId === undefined) {
    return { ...document, content: [...document.content, node] };
  }

  const content = beneathTarget(document.content, node, targetBlockId);

  if (content === undefined) {
    throw new Error(
      `Block ${JSON.stringify(targetBlockId)} is not in the document's content.`,
    );
  }

  return { ...document, content };
}
