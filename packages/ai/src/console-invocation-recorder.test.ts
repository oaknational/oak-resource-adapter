import { describe, expect, it } from "vitest";

import type { ModelInvocationResponse, ModelInvocationStarted } from "./index.js";
import { createConsoleInvocationRecorder, ModelInvocationError } from "./index.js";

const secretPrompt = "SECRET_PROMPT_CONTENT";
const secretOutput = "SECRET_MODEL_OUTPUT";
const secretErrorMessage = "SECRET_PROVIDER_ERROR";

const started: ModelInvocationStarted = {
  correlationKey: "workflow-step-1",
  invocationId: "invocation-1",
  model: "gpt-5.6-luna",
  provider: "openai",
  request: { input: secretPrompt },
  role: "quick-classifier",
  startedAt: new Date("2026-07-27T10:00:00.000Z"),
  transport: "primary",
};

const completedAt = new Date("2026-07-27T10:00:01.000Z");

const response: ModelInvocationResponse = {
  output: { kind: "TEXT", text: secretOutput },
  providerResponseId: "response-1",
  rawResponse: { id: "response-1", output_text: secretOutput },
  usage: {
    inputTokens: 12,
    outputTokens: 3,
    totalTokens: 15,
  },
};

function collectingRecorder() {
  const calls: unknown[][] = [];
  const recorder = createConsoleInvocationRecorder((...args) => {
    calls.push(args);
  });
  return { calls, recorder };
}

describe("createConsoleInvocationRecorder", () => {
  it("logs lifecycle metadata without prompt, output, or error content", () => {
    const { calls, recorder } = collectingRecorder();

    recorder.recordStarted(started);
    recorder.recordSucceeded({ ...started, completedAt, durationMs: 1_000, response });
    recorder.recordFailed({
      ...started,
      completedAt,
      durationMs: 1_000,
      error: new ModelInvocationError({
        cause: new Error(secretErrorMessage),
        code: "PROVIDER_ERROR",
      }),
    });

    const logged = JSON.stringify(calls);
    expect(logged).toContain("quick-classifier");
    expect(logged).toContain("response-1");
    expect(logged).toContain("workflow-step-1");
    expect(logged).toContain("PROVIDER_ERROR");
    expect(logged).not.toContain(secretPrompt);
    expect(logged).not.toContain(secretOutput);
    expect(logged).not.toContain(secretErrorMessage);
  });

  it("logs the classified code, provider code, status, and retryability", () => {
    const { calls, recorder } = collectingRecorder();

    recorder.recordFailed({
      ...started,
      completedAt,
      durationMs: 1_000,
      error: new ModelInvocationError({
        cause: new Error(secretErrorMessage),
        code: "RATE_LIMITED",
        providerCode: "rate_limit_exceeded",
        status: 429,
      }),
      response,
    });

    expect(calls[0]?.[1]).toMatchObject({
      errorCode: "RATE_LIMITED",
      errorStatus: 429,
      providerCode: "rate_limit_exceeded",
      responseId: "response-1",
      retryable: true,
      usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
    });
    expect(JSON.stringify(calls)).not.toContain(secretErrorMessage);
    expect(JSON.stringify(calls)).not.toContain(secretOutput);
  });

  it("logs the application-side output validation status", () => {
    const { calls, recorder } = collectingRecorder();

    recorder.recordSucceeded({
      ...started,
      completedAt,
      durationMs: 1_000,
      outputValidationStatus: "SCHEMA_MISMATCH",
      response,
    });

    expect(calls[0]?.[1]).toMatchObject({
      outputValidationStatus: "SCHEMA_MISMATCH",
    });
  });
});
