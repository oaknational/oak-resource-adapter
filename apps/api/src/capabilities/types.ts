import type { LessonRights } from "@oaknational/resource-adapter-curriculum";
import type {
  LessonContext,
  ResourceAdapterCapability,
} from "@oaknational/resource-adapter-contracts";

import type { RegisteredTransformationKind } from "../transformations/registry";
import type { RegisteredSuggestionFlowId } from "../suggestions/flow-ids";

/** Two lists rather than one: they come from different systems and can disagree. */
export type EligibilityContext = Readonly<{
  lesson: LessonContext;
  /** `null` when Oak publishes no such lesson in the programme. */
  rights: LessonRights | null;
  originalFileResourceTypes: readonly string[];
  extractedResourceTypes: readonly string[];
}>;

export type CapabilityDefinition = Readonly<
  ResourceAdapterCapability & {
    isEligible: (context: EligibilityContext) => boolean;
    /** Every kind owned by this capability, including drafts, in display order. */
    transformationKinds: readonly RegisteredTransformationKind[];
    suggestionFlowId?: RegisteredSuggestionFlowId;
  }
>;

export function hasResourceInputs(
  {
    extractedResourceTypes,
    originalFileResourceTypes,
  }: Pick<EligibilityContext, "extractedResourceTypes" | "originalFileResourceTypes">,
  resourceType: string,
): boolean {
  return (
    originalFileResourceTypes.includes(resourceType) &&
    extractedResourceTypes.includes(resourceType)
  );
}
