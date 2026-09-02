import { z } from "zod";

import { defineJob } from "../define-job";

export const retryTransformationJob = defineJob({
  kind: "transformations.retry",
  input: z.strictObject({
    adaptationId: z.uuid(),
    attemptId: z.uuid(),
    requestId: z.uuid(),
    resourceDocumentId: z.uuid(),
  }),
});
