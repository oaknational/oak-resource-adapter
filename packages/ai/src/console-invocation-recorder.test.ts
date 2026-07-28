import { describe, expect, it } from "vitest";

import type { ModelInvocationResponse, ModelInvocationStarted } from "./index.js";
import { createConsoleInvocationRecorder } from "./index.js";

const secretPrompt = "SECRET_PROMPT_CONTENT";
const secretOutput = "SECRET_MODEL_OUTPUT";
const secretErrorMessage = "SECRET_PROVIDER_ERROR";

const started: ModelInvocationStarted = {
  correlationKey: "workflow-step-1",
  invocationId: "invocation-1",
  model: "gpt-5.4-2026-03-05",
  provider: "openai",
  request: { input: secretPrompt },
  role: "quick-classifier",
  startedAt: new Date("2026-07-27T10:00:00.000Z"),
  transport: "primary",
};

const completedAt = new Date("2026-07-27T10:00:01.000Z");

const response = {
  id: "response-1",
  output_text: secretOutput,
  usage: {
    input_tokens: 12,
    output_tokens: 3,
    total_tokens: 15,
  },
} as unknown as ModelInvocationResponse;

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
      error: new Error(secretErrorMessage),
    });

    const logged = JSON.stringify(calls);
    expect(logged).toContain("quick-classifier");
    expect(logged).toContain("response-1");
    expect(logged).toContain("workflow-step-1");
    expect(logged).toContain("Error");
    expect(logged).not.toContain(secretPrompt);
    expect(logged).not.toContain(secretOutput);
    expect(logged).not.toContain(secretErrorMessage);
  });

  it("logs provider error status and code without the message", () => {
    const { calls, recorder } = collectingRecorder();
    const providerError = Object.assign(new Error(secretErrorMessage), {
      code: "rate_limit_exceeded",
      name: "RateLimitError",
      status: 429,
    });

    recorder.recordFailed({
      ...started,
      completedAt,
      durationMs: 1_000,
      error: providerError,
    });

    expect(calls[0]?.[1]).toMatchObject({
      errorCode: "rate_limit_exceeded",
      errorName: "RateLimitError",
      errorStatus: 429,
    });
    expect(JSON.stringify(calls)).not.toContain(secretErrorMessage);
  });

  it("labels a non-Error rejection without inspecting its contents", () => {
    const { calls, recorder } = collectingRecorder();

    recorder.recordFailed({
      ...started,
      completedAt,
      durationMs: 1_000,
      error: { detail: secretErrorMessage },
    });

    expect(calls[0]?.[1]).toMatchObject({
      errorName: "UnknownModelInvocationError",
    });
    expect(JSON.stringify(calls)).not.toContain(secretErrorMessage);
  });
});
