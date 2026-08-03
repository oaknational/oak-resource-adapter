import { describe, expect, it } from "vitest";

import {
  MODEL_INVOCATION_ERROR_CODES,
  ModelInvocationError,
  normaliseModelInvocationError,
  type ModelInvocationErrorCode,
} from "./index.js";

/** Keyed by code, so a new one cannot be added without deciding its retryability. */
const RETRYABLE_BY_CODE: Readonly<Record<ModelInvocationErrorCode, boolean>> = {
  ABORTED: false,
  AUTHENTICATION_FAILED: false,
  INVALID_CONFIGURATION: false,
  INVALID_REQUEST: false,
  PROVIDER_ERROR: false,
  PROVIDER_UNAVAILABLE: true,
  RATE_LIMITED: true,
  RECORDING_UNAVAILABLE: true,
  TIMED_OUT: true,
};

describe("ModelInvocationError", () => {
  it.each(Object.entries(RETRYABLE_BY_CODE) as [ModelInvocationErrorCode, boolean][])(
    "derives retryable %s as %s",
    (code, retryable) => {
      expect(new ModelInvocationError({ code }).retryable).toBe(retryable);
    },
  );

  it("lists each code once", () => {
    expect(new Set(MODEL_INVOCATION_ERROR_CODES).size).toBe(
      MODEL_INVOCATION_ERROR_CODES.length,
    );
  });

  it("keeps provider detail on the cause rather than the message", () => {
    const cause = new Error("secret provider detail");
    const error = new ModelInvocationError({ cause, code: "PROVIDER_ERROR" });

    expect(error.message).toBe("The model provider call failed.");
    expect(error.cause).toBe(cause);
  });
});

describe("normaliseModelInvocationError", () => {
  it.each([
    [401, "AUTHENTICATION_FAILED", false],
    [403, "AUTHENTICATION_FAILED", false],
    [400, "INVALID_REQUEST", false],
    [408, "TIMED_OUT", true],
    [409, "INVALID_REQUEST", false],
    [429, "RATE_LIMITED", true],
    [503, "PROVIDER_UNAVAILABLE", true],
  ] as const)("maps provider status %s to %s", (status, code, retryable) => {
    expect(
      normaliseModelInvocationError(
        Object.assign(new Error("provider detail"), { status }),
      ),
    ).toMatchObject({ code, retryable, status });
  });

  it("contains an unknown rejection in the provider fallback", () => {
    const rejection = { sensitive: "provider detail" };
    expect(normaliseModelInvocationError(rejection)).toMatchObject({
      cause: rejection,
      code: "PROVIDER_ERROR",
      message: "The model provider call failed.",
      retryable: false,
    });
  });

  it("preserves a transport's already-normalised error", () => {
    const error = new ModelInvocationError({ code: "INVALID_REQUEST" });

    expect(normaliseModelInvocationError(error)).toBe(error);
  });
});
