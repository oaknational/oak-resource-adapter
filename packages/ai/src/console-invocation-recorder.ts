import { raLogger } from "@oaknational/resource-adapter-logger";

import type {
  InvocationRecorder,
  ModelInvocationFailed,
  ModelInvocationStarted,
  ModelInvocationSucceeded,
} from "./invocation-recorder.js";

type InfoLogger = (formatter: unknown, ...args: unknown[]) => void;

function baseLogFields(invocation: ModelInvocationStarted) {
  return {
    invocationId: invocation.invocationId,
    correlationKey: invocation.correlationKey,
    promptTemplateId: invocation.promptTemplateId,
    role: invocation.role,
    provider: invocation.provider,
    transport: invocation.transport,
    model: invocation.model,
    startedAt: invocation.startedAt.toISOString(),
  };
}

/**
 * A development recorder that logs lifecycle metadata to the `ra:ai` debug
 * namespace.
 *
 * This is not a production recorder: output is suppressed unless `DEBUG`
 * matches, and nothing is persisted. Production deployments must supply a
 * durable {@link InvocationRecorder}.
 */
export function createConsoleInvocationRecorder(
  info: InfoLogger = raLogger("ai").info,
): InvocationRecorder {
  return {
    recordStarted(invocation) {
      info("Model invocation started %o", baseLogFields(invocation));
    },
    recordSucceeded(invocation: ModelInvocationSucceeded) {
      info("Model invocation succeeded %o", {
        ...baseLogFields(invocation),
        completedAt: invocation.completedAt.toISOString(),
        durationMs: invocation.durationMs,
        outputValidationStatus: invocation.outputValidationStatus,
        responseId: invocation.response.providerResponseId,
        usage: invocation.response.usage
          ? {
              inputTokens: invocation.response.usage.inputTokens,
              outputTokens: invocation.response.usage.outputTokens,
              totalTokens: invocation.response.usage.totalTokens,
            }
          : undefined,
      });
    },
    recordFailed(invocation: ModelInvocationFailed) {
      // Classification only. The provider's message can carry prompt content and
      // stays on `cause`; its code is diagnostic and does not.
      info("Model invocation failed %o", {
        ...baseLogFields(invocation),
        completedAt: invocation.completedAt.toISOString(),
        durationMs: invocation.durationMs,
        errorCode: invocation.error.code,
        errorStatus: invocation.error.status,
        providerCode: invocation.error.providerCode,
        responseId: invocation.response?.providerResponseId,
        retryable: invocation.error.retryable,
        usage: invocation.response?.usage,
      });
    },
  };
}
