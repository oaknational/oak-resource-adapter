import { z } from "zod";

/**
 * Job inputs must stay portable between PostgreSQL, Prisma, and the workflow
 * event log.
 */
export const jobJsonSchema = z.json();
export const jobIdSchema = z.uuid();
export const idempotencyKeySchema = z.string().trim().min(1).max(128);
export const jobFailureSchema = z.strictObject({
  code: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(500),
});

export type JobJsonValue = z.infer<typeof jobJsonSchema>;
export type JobFailure = z.infer<typeof jobFailureSchema>;
