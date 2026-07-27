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
    role: invocation.role,
    provider: invocation.provider,
    transport: invocation.transport,
    model: invocation.model,
    startedAt: invocation.startedAt.toISOString(),
  };
}

/** `status` and `code` distinguish, for example, a rate limit from an outage. */
function errorLogFields(error: unknown) {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownModelInvocationError" };
  }

  const candidate = error as { code?: unknown; status?: unknown };
  return {
    errorName: error.name,
    ...(typeof candidate.status === "number" ? { errorStatus: candidate.status } : {}),
    ...(typeof candidate.code === "string" ? { errorCode: candidate.code } : {}),
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
        responseId: invocation.response.id,
        usage: invocation.response.usage
          ? {
              inputTokens: invocation.response.usage.input_tokens,
              outputTokens: invocation.response.usage.output_tokens,
              totalTokens: invocation.response.usage.total_tokens,
            }
          : undefined,
      });
    },
    recordFailed(invocation: ModelInvocationFailed) {
      info("Model invocation failed %o", {
        ...baseLogFields(invocation),
        completedAt: invocation.completedAt.toISOString(),
        durationMs: invocation.durationMs,
        ...errorLogFields(invocation.error),
      });
    },
  };
}
