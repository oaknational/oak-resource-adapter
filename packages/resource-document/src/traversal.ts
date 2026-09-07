import type { ResourceDocument, ResourceNode } from "./schema/types.js";

export interface ResourceDocumentTraversalOptions {
  includeAnswerContent?: boolean;
}

function* walkNodes(nodes: readonly ResourceNode[]): Generator<ResourceNode> {
  for (const node of nodes) {
    yield node;

    if ("children" in node) {
      yield* walkNodes(node.children);
    }
  }
}

/** Walks nodes in semantic reading order, followed by answer content by default. */
export function* walkResourceDocument(
  document: ResourceDocument,
  options: ResourceDocumentTraversalOptions = {},
): Generator<ResourceNode> {
  yield* walkNodes(document.content);

  if (options.includeAnswerContent !== false) {
    for (const answer of document.answers) {
      yield* walkNodes(answer.content);
    }
  }
}

export function getResourceNodeById(
  document: ResourceDocument,
  id: string,
): ResourceNode | undefined {
  for (const node of walkResourceDocument(document)) {
    if (node.id === id) {
      return node;
    }
  }

  return undefined;
}

export type ResourceNodeOfType<Type extends ResourceNode["type"]> = Extract<
  ResourceNode,
  { type: Type }
>;

export function getResourceNodesByType<Type extends ResourceNode["type"]>(
  document: ResourceDocument,
  type: Type,
): Array<ResourceNodeOfType<Type>> {
  return Array.from(walkResourceDocument(document)).filter(
    (node): node is ResourceNodeOfType<Type> => node.type === type,
  );
}

function mapNodes(
  nodes: readonly ResourceNode[],
  id: string,
  update: (node: ResourceNode) => ResourceNode,
): ResourceNode[] | undefined {
  const index = nodes.findIndex((node) => node.id === id);
  const target = index === -1 ? undefined : nodes[index];
  if (target !== undefined) {
    return nodes.with(index, update(target));
  }

  for (const [position, node] of nodes.entries()) {
    if (!("children" in node)) {
      continue;
    }
    const children = mapNodes(node.children, id, update);
    if (children !== undefined) {
      return nodes.with(position, { ...node, children });
    }
  }
  return undefined;
}

/** Replaces one node wherever it sits, or returns undefined when the id is absent. */
export function updateResourceNodeById(
  document: ResourceDocument,
  id: string,
  update: (node: ResourceNode) => ResourceNode,
): ResourceDocument | undefined {
  const content = mapNodes(document.content, id, update);
  if (content !== undefined) {
    return { ...document, content };
  }

  for (const [position, answer] of document.answers.entries()) {
    const answerContent = mapNodes(answer.content, id, update);
    if (answerContent !== undefined) {
      return {
        ...document,
        answers: document.answers.with(position, {
          ...answer,
          content: answerContent,
        }),
      };
    }
  }
  return undefined;
}

function keepNodes(
  nodes: readonly ResourceNode[],
  shouldKeep: (node: ResourceNode) => boolean,
): ResourceNode[] {
  const kept: ResourceNode[] = [];
  for (const node of nodes) {
    if (!shouldKeep(node)) {
      continue;
    }
    if ("children" in node) {
      kept.push({ ...node, children: keepNodes(node.children, shouldKeep) });
    } else {
      kept.push(node);
    }
  }
  return kept;
}

/** Drops every node the predicate rejects, throughout content and answer content. */
export function filterResourceNodes(
  document: ResourceDocument,
  shouldKeep: (node: ResourceNode) => boolean,
): ResourceDocument {
  return {
    ...document,
    answers: document.answers.map((answer) => ({
      ...answer,
      content: keepNodes(answer.content, shouldKeep),
    })),
    content: keepNodes(document.content, shouldKeep),
  };
}
