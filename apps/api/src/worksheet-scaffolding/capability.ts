import { capabilityDefinitions } from "../capabilities/registry";

export const CAPABILITY = capabilityDefinitions.worksheetScaffolding;
export const SUGGESTION_FLOW_ID = CAPABILITY.suggestionFlowId;

/** Initial generation and teacher-requested regeneration share one operation. */
export const SUGGESTION_OPERATION_KIND = `suggestions.${SUGGESTION_FLOW_ID}`;
export const REMOVAL_OPERATION_KIND = "transformations.remove";
export const DISMISSAL_OPERATION_KIND = "transformations.dismiss";

/**
 * Identifies reviewing one worksheet for suggestions. The automatic run shares this
 * key with the operation it records, so concurrent readers ask for the same review.
 */
export function suggestionOperationKey(resourceDocumentId: string): string {
  return `suggest:${resourceDocumentId}`;
}

export function suggestionRetryJobKey(
  resourceDocumentId: string,
  requestId: string,
): string {
  return `retrySuggestions:${resourceDocumentId}:${requestId}`;
}

/** Coordinates work that reads or replaces one version of an adaptation head. */
export function adaptationHeadConcurrencyKey(
  adaptationId: string,
  resourceDocumentId: string,
): string {
  return `adaptation:${adaptationId}:head:${resourceDocumentId}`;
}
