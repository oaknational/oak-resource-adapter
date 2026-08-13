import type { ResourceDocument, ResourceNode } from "./schema/current.js";

export interface ResourceDocumentTraversalOptions {
  includeAnswerContent?: boolean;
}

function* walkNodes(nodes: readonly ResourceNode[]): Generator<ResourceNode> {
  for (const node of nodes) {
    yield node;

    if (node.type === "section" || node.type === "question") {
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
