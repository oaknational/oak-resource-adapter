import {
  getDatabaseClient,
  modelInvocations,
  type DatabaseClient,
} from "@oaknational/resource-adapter-db";
import { eq } from "drizzle-orm";

import { errorMetadata } from "../error-metadata.js";
import type { InvocationRecorder } from "../invocation-recorder.js";

export type DatabaseInvocationRecorderConfig = Readonly<{
  database?: DatabaseClient;
  /** The attempt every invocation from this recorder belongs to. */
  generationAttemptId: string;
}>;

/**
 * Persists each physical model call to `model_invocations`.
 *
 * Written in two steps: the insert happens before the provider call, so an
 * invocation abandoned mid-flight still leaves a row for the update to complete.
 */
export function createDatabaseInvocationRecorder(
  config: DatabaseInvocationRecorderConfig,
): InvocationRecorder {
  const database = (): DatabaseClient => config.database ?? getDatabaseClient();

  return {
    async recordStarted(invocation) {
      await database()
        .insert(modelInvocations)
        .values({
          correlationKey: invocation.correlationKey ?? null,
          generationAttemptId: config.generationAttemptId,
          id: invocation.invocationId,
          model: invocation.model,
          promptTemplateId: invocation.promptTemplateId ?? null,
          provider: invocation.provider,
          request: invocation.request,
          role: invocation.role,
          startedAt: invocation.startedAt,
          transport: invocation.transport,
        });
    },

    async recordSucceeded(invocation) {
      const usage = invocation.response.usage;

      await database()
        .update(modelInvocations)
        .set({
          completedAt: invocation.completedAt,
          durationMs: invocation.durationMs,
          inputTokens: usage?.input_tokens ?? null,
          outputTokens: usage?.output_tokens ?? null,
          providerResponseId: invocation.response.id,
          response: invocation.response,
        })
        .where(eq(modelInvocations.id, invocation.invocationId));
    },

    async recordFailed(invocation) {
      const { errorCode, errorName, errorStatus } = errorMetadata(invocation.error);

      await database()
        .update(modelInvocations)
        .set({
          completedAt: invocation.completedAt,
          durationMs: invocation.durationMs,
          errorCode: errorCode ?? null,
          errorName,
          errorStatus: errorStatus ?? null,
        })
        .where(eq(modelInvocations.id, invocation.invocationId));
    },
  };
}
