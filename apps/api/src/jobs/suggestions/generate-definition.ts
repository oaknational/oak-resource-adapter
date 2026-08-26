import { z } from "zod";

import { defineJob } from "../define-job";
import { registeredSuggestionFlowIds } from "../../suggestions/flow-ids";

export const generateSuggestionsJob = defineJob({
  kind: "suggestions.generate",
  input: z.strictObject({
    adaptationId: z.uuid(),
    flowId: z.enum(registeredSuggestionFlowIds),
    resourceDocumentId: z.uuid(),
  }),
});
