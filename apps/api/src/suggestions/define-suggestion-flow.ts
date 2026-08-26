import type { SuggestionFlowDefinition } from "./types";

export function defineSuggestionFlow<const TFlow extends SuggestionFlowDefinition>(
  flow: TFlow,
): TFlow {
  if (!Number.isInteger(flow.maxSuggestions) || flow.maxSuggestions < 1) {
    throw new RangeError(`${flow.id} must allow at least one suggestion.`);
  }

  if (new Set(flow.transformationKinds).size !== flow.transformationKinds.length) {
    throw new Error(`${flow.id} lists a transformation more than once.`);
  }

  return flow;
}
