import { z } from "zod";

import { defineJob } from "../define-job";

export const dismissTransformationsJob = defineJob({
  kind: "transformations.dismiss",
  input: z.strictObject({
    adaptationId: z.uuid(),
    resourceDocumentId: z.uuid(),
    targetBlockId: z.string().min(1).nullable(),
  }),
});
