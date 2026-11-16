import type {
  NamespacedExtensions,
  ResourceDocument,
  ResourceNode,
} from "./schema/types.js";
import { walkResourceDocument } from "./traversal.js";

/** Namespaced so a contribution stays identifiable in an exported document. */
export const CONTRIBUTION_EXTENSION_KEY = "oak:contribution";

export function contributionIdOf(
  extensions: NamespacedExtensions | undefined,
): string | undefined {
  const id = extensions?.[CONTRIBUTION_EXTENSION_KEY];
  return typeof id === "string" ? id : undefined;
}

function* topMostContributed(
  nodes: readonly ResourceNode[],
  contributionId: string,
): Generator<ResourceNode> {
  for (const node of nodes) {
    if (contributionIdOf(node.extensions) === contributionId) {
      yield node;
    } else if ("children" in node) {
      yield* topMostContributed(node.children, contributionId);
    }
  }
}

/**
 * The outermost nodes one contribution added, at any depth, in content then
 * answers. Each node's descendants come with it, so nothing is returned twice.
 */
export function contributedNodes(
  document: ResourceDocument,
  contributionId: string,
): readonly ResourceNode[] {
  return [
    ...topMostContributed(document.content, contributionId),
    ...document.answers.flatMap((answer) => [
      ...topMostContributed(answer.content, contributionId),
    ]),
  ];
}

/** IDs of generated contributions still present in this document revision. */
export function contributionIdsInDocument(
  document: ResourceDocument,
): readonly string[] {
  const ids = new Set<string>();
  const add = (extensions: NamespacedExtensions | undefined) => {
    const id = contributionIdOf(extensions);
    if (id !== undefined) {
      ids.add(id);
    }
  };

  for (const node of walkResourceDocument(document)) {
    add(node.extensions);
  }
  for (const answer of document.answers) {
    add(answer.extensions);
  }
  for (const asset of document.assets) {
    add(asset.extensions);
  }

  return [...ids];
}
