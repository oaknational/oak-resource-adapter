import { defineSuggestionFlow } from "../../define-suggestion-flow";
import { worksheetScaffoldingCapability } from "../../../capabilities/definitions/worksheet-scaffolding";
import { worksheetScaffoldingSuggestionPrompt } from "./prompt";

export const worksheetScaffoldingSuggestionFlow = defineSuggestionFlow({
  capabilityId: worksheetScaffoldingCapability.id,
  id: worksheetScaffoldingCapability.suggestionFlowId,
  maxSuggestions: 5,
  prompt: worksheetScaffoldingSuggestionPrompt,
  role: "worksheet-scaffolding-suggester",
  transformationKinds: worksheetScaffoldingCapability.transformationKinds,
} as const);
