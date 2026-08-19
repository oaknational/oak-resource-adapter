import type {
  LessonContext,
  ResourceAdapterCapability,
} from "@oaknational/resource-adapter-contracts";

import type { RegisteredTransformationKind } from "../transformations/registry";

/** Two lists rather than one: they come from different systems and can disagree. */
export type EligibilityContext = Readonly<{
  lesson: LessonContext;
  originalFileResourceTypes: readonly string[];
  extractedResourceTypes: readonly string[];
}>;

export type CapabilityDefinition = Readonly<
  ResourceAdapterCapability & {
    isEligible: (context: EligibilityContext) => boolean;
    /** The transformations this capability offers, in the order a teacher sees them. */
    transformations: readonly RegisteredTransformationKind[];
  }
>;

export function isAdaptable(
  { extractedResourceTypes, originalFileResourceTypes }: EligibilityContext,
  resourceType: string,
): boolean {
  return (
    originalFileResourceTypes.includes(resourceType) &&
    extractedResourceTypes.includes(resourceType)
  );
}
