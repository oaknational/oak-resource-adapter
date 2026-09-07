import { z } from "zod";

import { defineJob } from "../define-job";

export const removeTransformationJob = defineJob({
  kind: "transformations.remove",
  input: z.strictObject({
    adaptationId: z.uuid(),
    contributionId: z.uuid(),
    resourceDocumentId: z.uuid(),
  }),
});
