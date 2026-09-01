import type { ResourceDocument, ResourceNode } from "@oaknational/resource-document";

/** Rebuilds a sibling list with the contribution placed relative to `index`. */
type Placement = (siblings: readonly ResourceNode[], index: number) => ResourceNode[];

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

function descend(
  nodes: readonly ResourceNode[],
  targetBlockId: string,
  place: Placement,
): ResourceNode[] | undefined {
  const index = nodes.findIndex((candidate) => candidate.id === targetBlockId);

  if (index !== -1) {
    return place(nodes, index);
  }

  for (const [position, candidate] of nodes.entries()) {
    if (!hasChildren(candidate)) {
      continue;
    }

    const children = descend(candidate.children, targetBlockId, place);

    if (children !== undefined) {
      return nodes.with(position, { ...candidate, children });
    }
  }

  return undefined;
}

function place(
  document: ResourceDocument,
  targetBlockId: string,
  placement: Placement,
): ResourceDocument {
  const content = descend(document.content, targetBlockId, placement);

  if (content === undefined) {
    throw new Error(
      `Block ${JSON.stringify(targetBlockId)} is not in the document's content.`,
    );
  }

  return { ...document, content };
}

/** Copies the document with `node` immediately before its target sibling. */
export function insertBefore(
  document: ResourceDocument,
  node: ResourceNode,
  targetBlockId: string,
): ResourceDocument {
  return place(document, targetBlockId, (siblings, index) => [
    ...siblings.slice(0, index),
    node,
    ...siblings.slice(index),
  ]);
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

  return place(document, targetBlockId, (siblings, index) => {
    const target = siblings[index];

    return target !== undefined && hasChildren(target)
      ? siblings.with(index, {
          ...target,
          children: withinChildren(target.children, node),
        })
      : [...siblings.slice(0, index + 1), node, ...siblings.slice(index + 1)];
  });
}

/**
 * Document-wide support leads the worksheet body: after a level 1 title, before
 * the first content node, or last when there is no body to lead.
 */
export function insertAtStartOfBody(
  document: ResourceDocument,
  node: ResourceNode,
): ResourceDocument {
  const [firstNode, secondNode] = document.content;
  const firstBodyNode =
    firstNode?.type === "heading" && firstNode.level === 1 ? secondNode : firstNode;

  return firstBodyNode === undefined
    ? { ...document, content: [...document.content, node] }
    : insertBefore(document, node, firstBodyNode.id);
}
