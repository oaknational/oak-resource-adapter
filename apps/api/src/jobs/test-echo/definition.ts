import { z } from "zod";

import { defineJob } from "../define-job";

export const testEchoJob = defineJob({
  kind: "test.echo",
  invokesModel: false,
  input: z.strictObject({
    message: z.string().trim().min(1).max(200),
  }),
});

export type TestEchoJobInput = z.infer<typeof testEchoJob.input>;
