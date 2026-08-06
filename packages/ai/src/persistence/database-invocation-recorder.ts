import {
  getDatabaseClient,
  modelInvocations,
  type DatabaseClient,
} from "@oaknational/resource-adapter-db";
import { eq } from "drizzle-orm";

import type { InvocationRecorder } from "../invocation-recorder.js";

export type DatabaseInvocationRecorderConfig = Readonly<{
  database?: DatabaseClient;
  transformationAttemptId: string;
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
          id: invocation.invocationId,
          model: invocation.model,
          promptTemplateId: invocation.promptTemplateId ?? null,
          provider: invocation.provider,
          request: invocation.request,
          role: invocation.role,
          startedAt: invocation.startedAt,
          transformationAttemptId: config.transformationAttemptId,
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
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          outputValidationStatus: invocation.outputValidationStatus ?? null,
          providerResponseId: invocation.response.providerResponseId ?? null,
          response: invocation.response.rawResponse,
        })
        .where(eq(modelInvocations.id, invocation.invocationId));
    },

    async recordFailed(invocation) {
      const usage = invocation.response?.usage;

      await database()
        .update(modelInvocations)
        .set({
          completedAt: invocation.completedAt,
          durationMs: invocation.durationMs,
          errorCode: invocation.error.code,
          errorName: invocation.error.name,
          errorStatus: invocation.error.status ?? null,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          providerResponseId: invocation.response?.providerResponseId ?? null,
          response: invocation.response?.rawResponse ?? null,
        })
        .where(eq(modelInvocations.id, invocation.invocationId));
    },
  };
}
