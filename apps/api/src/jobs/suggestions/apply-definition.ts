import { z } from "zod";

import { defineJob } from "../define-job";

export const applySuggestionJob = defineJob({
  kind: "suggestions.apply",
  input: z.strictObject({
    adaptationId: z.uuid(),
    params: z.record(z.string(), z.json()),
    resourceDocumentId: z.uuid(),
    suggestionId: z.uuid(),
  }),
});
