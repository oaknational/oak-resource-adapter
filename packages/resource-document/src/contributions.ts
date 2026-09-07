import type { NamespacedExtensions, ResourceDocument } from "./schema/types.js";
import { walkResourceDocument } from "./traversal.js";

/** Namespaced so a contribution stays identifiable in an exported document. */
export const CONTRIBUTION_EXTENSION_KEY = "oak:contribution";

export function contributionIdOf(
  extensions: NamespacedExtensions | undefined,
): string | undefined {
  const id = extensions?.[CONTRIBUTION_EXTENSION_KEY];
  return typeof id === "string" ? id : undefined;
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
