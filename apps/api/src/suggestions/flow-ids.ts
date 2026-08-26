/**
 * A leaf module: the workflow bundle imports job definitions, so anything they
 * reference must stay clear of the prompt and database packages.
 */
export const registeredSuggestionFlowIds = ["worksheet-scaffolding"] as const;

export type RegisteredSuggestionFlowId = (typeof registeredSuggestionFlowIds)[number];
