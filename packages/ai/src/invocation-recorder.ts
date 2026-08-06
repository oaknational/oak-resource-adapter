import type { ModelInvocationError } from "./model-invocation-error.js";
import type { OutputValidationStatus } from "./model-output.js";
import type { ModelInvocationResponse, ModelResponseRecord } from "./protocol.js";
import type { ResolvedModelInvocation } from "./resolved-invocation.js";

export type ModelInvocationStarted = ResolvedModelInvocation &
  Readonly<{
    startedAt: Date;
  }>;

export type ModelInvocationSucceeded = ModelInvocationStarted &
  Readonly<{
    completedAt: Date;
    durationMs: number;
    outputValidationStatus?: OutputValidationStatus;
    response: ModelInvocationResponse;
  }>;

export type ModelInvocationFailed = ModelInvocationStarted &
  Readonly<{
    completedAt: Date;
    durationMs: number;
    error: ModelInvocationError;
    response?: ModelResponseRecord;
  }>;

/**
 * Persists or observes the lifecycle of each physical model invocation.
 *
 * Implementations may receive prompt and response content. They are
 * responsible for applying the appropriate data-retention and redaction rules.
 */
export interface InvocationRecorder {
  recordFailed(invocation: ModelInvocationFailed): Promise<void> | void;
  recordStarted(invocation: ModelInvocationStarted): Promise<void> | void;
  recordSucceeded(invocation: ModelInvocationSucceeded): Promise<void> | void;
}
