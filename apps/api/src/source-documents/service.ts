import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { ResourceAdapterSourceDocumentRequest } from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import type { ResourceDocument } from "@oaknational/resource-document";

import {
  isCapabilityEligible,
  resolveEligibility,
  type EligibilityResolver,
} from "../capabilities/service";
import { capabilityDefinitions } from "../capabilities/registry";
import type { CapabilityDefinition } from "../capabilities/types";

type SourceDocumentReader = Readonly<{
  get: (locator: {
    source: "oak";
    lessonSlug: string;
    programmeSlug: string;
    resourceType: string;
  }) => Promise<ResourceDocument>;
}>;

/**
 * Source documents require authentication but are not teacher-owned.
 * Eligibility is checked at source entry, not on stored adaptations.
 */
export async function getSourceDocument(
  { capabilityId, lesson }: ResourceAdapterSourceDocumentRequest,
  _target: ResourceAdapterAuthenticatedTeacher,
  resolveContext: EligibilityResolver = resolveEligibility,
  documents: SourceDocumentReader = originalResourceDocuments,
): Promise<ResourceDocument | null> {
  const definitions: Record<string, CapabilityDefinition> = capabilityDefinitions;
  const definition = definitions[capabilityId];

  if (!definition || !isCapabilityEligible(definition, await resolveContext(lesson))) {
    return null;
  }

  return documents.get({
    source: "oak",
    lessonSlug: lesson.lessonSlug,
    programmeSlug: lesson.programmeSlug,
    resourceType: definition.resourceType,
  });
}
