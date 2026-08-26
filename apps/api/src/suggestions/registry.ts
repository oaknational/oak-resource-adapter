import type { RegisteredSuggestionFlowId } from "./flow-ids";
import type { SuggestionFlowDefinition } from "./types";
import { worksheetScaffoldingSuggestionFlow } from "./definitions/worksheet-scaffolding";

export const suggestionFlowDefinitions = {
  "worksheet-scaffolding": worksheetScaffoldingSuggestionFlow,
} as const satisfies Record<RegisteredSuggestionFlowId, SuggestionFlowDefinition>;

export type { RegisteredSuggestionFlowId };
