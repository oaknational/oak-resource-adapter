import { raLogger } from "@oaknational/resource-adapter-logger";

import { describeError } from "./error-metadata.js";

/** The lifecycle event a recorder was writing when it failed. */
export type RecordingStage = "failed" | "succeeded";

export type RecorderErrorHandler = (
  error: unknown,
  stage: RecordingStage,
) => Promise<void> | void;

function reportRecorderError(error: unknown, stage: RecordingStage): void {
  // Deliberately do not attach the raw error as a cause: recorder failures can
  // contain prompts, model output, or persistence payloads. `describeError`
  // carries enough to tell, say, a connection failure from a constraint
  // violation without any of that content.
  raLogger("ai").error(
    new Error(
      `Model invocation recorder failed while recording "${stage}" (${describeError(error)}).`,
    ),
    { report: true },
  );
}

/**
 * Wraps a recorder error handler so that reporting can never throw.
 *
 * Both the configured handler and the fallback logger are guarded: recording is
 * observability, so no reporting path may discard a paid-for response or mask a
 * provider error.
 */
export function createRecorderErrorReporter(
  onRecorderError: RecorderErrorHandler = reportRecorderError,
): (error: unknown, stage: RecordingStage) => Promise<void> {
  return async (error, stage) => {
    try {
      await onRecorderError(error, stage);
      return;
    } catch {
      // Fall through: a broken handler is itself reported below.
    }

    try {
      raLogger("ai").error(
        new Error(
          `Model invocation recorder error handler failed while reporting "${stage}".`,
        ),
        { report: true },
      );
    } catch {
      // Last resort. `console.error` can throw on EPIPE if stdout has closed, and
      // that must not change invocation semantics.
    }
  };
}
