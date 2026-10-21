import { z } from "zod";

/** Enqueueing the job enforces each field's own rules. */
export const testJobRequestSchema = z.strictObject({
  idempotencyKey: z.string().optional(),
  message: z.string(),
});

export type TestJobRequest = z.input<typeof testJobRequestSchema>;

export const jobResponseSchema = z
  .object({
    completedAt: z.string().nullable(),
    createdAt: z.string(),
    failure: z
      .object({
        code: z.string(),
        message: z.string().nullable(),
      })
      .readonly()
      .nullable(),
    id: z.string(),
    kind: z.string(),
    startedAt: z.string().nullable(),
    status: z.enum(["queued", "running", "succeeded", "failed"]),
    updatedAt: z.string(),
    workflowRunId: z.string().nullable(),
  })
  .readonly();

export type JobResponse = z.infer<typeof jobResponseSchema>;
