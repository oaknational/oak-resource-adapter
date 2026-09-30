import { defineSuggestionFlow } from "../../define-suggestion-flow";
import { worksheetScaffoldingCapability } from "../../../capabilities/definitions/worksheet-scaffolding";
import { worksheetScaffoldingSuggestionPrompt } from "./prompt";

export const worksheetScaffoldingSuggestionFlow = defineSuggestionFlow({
  capabilityId: worksheetScaffoldingCapability.id,
  id: worksheetScaffoldingCapability.suggestionFlowId,
  materialRequirements: [
    { key: "lesson.outcome", required: false },
    { key: "lesson.keywords", required: false },
    { key: "lesson.keyLearningPoints", required: false },
  ],
  maxSuggestions: 20,
  prompt: worksheetScaffoldingSuggestionPrompt,
  role: "worksheet-scaffolding-suggester",
  transformationKinds: worksheetScaffoldingCapability.transformationKinds,
} as const);
