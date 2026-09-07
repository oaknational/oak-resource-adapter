import {
  updateResourceNodeById,
  walkResourceDocument,
  type ResourceDocument,
} from "@oaknational/resource-document";

export const TRANSFORMATIONS_DISMISSED_EXTENSION_KEY = "oak:transformations-dismissed";

function isDismissed(extensions: ResourceDocument["extensions"]): boolean {
  return extensions?.[TRANSFORMATIONS_DISMISSED_EXTENSION_KEY] === true;
}

/** Returns a revision carrying an invisible marker that no transformation is wanted. */
export function dismissTransformationsAt(
  document: ResourceDocument,
  targetBlockId: string | null,
): ResourceDocument {
  if (targetBlockId === null) {
    return {
      ...document,
      extensions: {
        ...document.extensions,
        [TRANSFORMATIONS_DISMISSED_EXTENSION_KEY]: true,
      },
    };
  }

  const dismissed = updateResourceNodeById(document, targetBlockId, (node) => ({
    ...node,
    extensions: {
      ...node.extensions,
      [TRANSFORMATIONS_DISMISSED_EXTENSION_KEY]: true,
    },
  }));
  if (dismissed === undefined) {
    throw new Error(`Block ${JSON.stringify(targetBlockId)} is not in the document.`);
  }
  return dismissed;
}

export function documentDismissesTransformations(document: ResourceDocument): boolean {
  return isDismissed(document.extensions);
}

/** Collected once per document so eligibility does not rewalk it per candidate. */
export function dismissedTargetIds(document: ResourceDocument): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const node of walkResourceDocument(document)) {
    if (isDismissed(node.extensions)) {
      ids.add(node.id);
    }
  }
  return ids;
}
