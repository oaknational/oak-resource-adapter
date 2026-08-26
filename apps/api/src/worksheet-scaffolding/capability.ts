import { capabilityDefinitions } from "../capabilities/registry";

export const CAPABILITY = capabilityDefinitions.worksheetScaffolding;
export const SUGGESTION_FLOW_ID = CAPABILITY.suggestionFlowId;

/** Generating suggestions is an internal operation, not a change a teacher asked for. */
export const SUGGESTION_OPERATION_KIND = `suggestions.${SUGGESTION_FLOW_ID}`;

/**
 * Identifies reviewing one worksheet for suggestions. The job and the operation
 * it records are deduplicated on the same key, so they are built in one place.
 */
export function suggestionOperationKey(resourceDocumentId: string): string {
  return `suggest:${resourceDocumentId}`;
}

/** Coordinates work that reads or replaces one version of an adaptation head. */
export function adaptationHeadConcurrencyKey(
  adaptationId: string,
  resourceDocumentId: string,
): string {
  return `adaptation:${adaptationId}:head:${resourceDocumentId}`;
}
