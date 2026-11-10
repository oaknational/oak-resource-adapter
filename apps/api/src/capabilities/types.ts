import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";
import type {
  LessonContext,
  ResourceAdapterCapability,
} from "@oaknational/resource-adapter-contracts";

import type { Rule } from "../rules/rule";
import type { RegisteredTransformationKind } from "../transformations/registry";
import type { RegisteredSuggestionFlowId } from "../suggestions/flow-ids";

/** Two lists rather than one: they come from different systems and can disagree. */
export type EligibilityContext = Readonly<{
  lesson: LessonContext;
  /** `null` when Oak publishes no such lesson in the programme. */
  facts: LessonEligibilityFacts | null;
  originalFileResourceTypes: readonly string[];
  extractedResourceTypes: readonly string[];
}>;

export type CapabilityDefinition = Readonly<
  ResourceAdapterCapability & {
    /** Checked in order, after the lesson rules, which they cannot override. */
    rules: readonly Rule<EligibilityContext>[];
    /** Every kind owned by this capability, including drafts, in display order. */
    transformationKinds: readonly RegisteredTransformationKind[];
    suggestionFlowId?: RegisteredSuggestionFlowId;
  }
>;
