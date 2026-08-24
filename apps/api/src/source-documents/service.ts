import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { ResourceAdapterSourceDocumentRequest } from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import type { ResourceDocument } from "@oaknational/resource-document";

import { resolveEligibility, type EligibilityResolver } from "../capabilities/service";
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
 * Resolves only documents belonging to capabilities that are currently
 * eligible for the authenticated lesson context. The teacher argument makes
 * the authentication boundary explicit; document ownership is not
 * teacher-specific.
 */
export async function getSourceDocument(
  { capabilityId, lesson }: ResourceAdapterSourceDocumentRequest,
  _target: ResourceAdapterAuthenticatedTeacher,
  resolveContext: EligibilityResolver = resolveEligibility,
  documents: SourceDocumentReader = originalResourceDocuments,
): Promise<ResourceDocument | null> {
  const definitions: Record<string, CapabilityDefinition> = capabilityDefinitions;
  const definition = definitions[capabilityId];

  if (
    definition === undefined ||
    !definition.isEligible(await resolveContext(lesson))
  ) {
    return null;
  }

  return documents.get({
    source: "oak",
    lessonSlug: lesson.lessonSlug,
    programmeSlug: lesson.programmeSlug,
    resourceType: definition.resourceType,
  });
}
