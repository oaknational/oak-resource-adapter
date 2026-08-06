export const MODEL_INVOCATION_ERROR_CODES = [
  "ABORTED",
  "AUTHENTICATION_FAILED",
  "INVALID_CONFIGURATION",
  "INVALID_REQUEST",
  "PROVIDER_ERROR",
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "RECORDING_UNAVAILABLE",
  "TIMED_OUT",
] as const;

export type ModelInvocationErrorCode = (typeof MODEL_INVOCATION_ERROR_CODES)[number];

const RETRYABLE_CODES: ReadonlySet<ModelInvocationErrorCode> = new Set([
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "RECORDING_UNAVAILABLE",
  "TIMED_OUT",
]);

export type ModelInvocationErrorOptions = Readonly<{
  cause?: unknown;
  code: ModelInvocationErrorCode;
  message?: string;
  providerCode?: string;
  status?: number;
}>;

const DEFAULT_MESSAGES: Readonly<Record<ModelInvocationErrorCode, string>> = {
  ABORTED: "The model invocation was cancelled.",
  AUTHENTICATION_FAILED: "The model provider rejected authentication.",
  INVALID_CONFIGURATION: "The model invocation is not configured correctly.",
  INVALID_REQUEST: "The model provider rejected the invocation request.",
  PROVIDER_ERROR: "The model provider call failed.",
  PROVIDER_UNAVAILABLE: "The model provider is temporarily unavailable.",
  RATE_LIMITED: "The model provider rate-limited the invocation.",
  RECORDING_UNAVAILABLE: "The model invocation could not be recorded.",
  TIMED_OUT: "The model invocation timed out.",
};

export class ModelInvocationError extends Error {
  readonly code: ModelInvocationErrorCode;
  readonly providerCode?: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(options: ModelInvocationErrorOptions) {
    super(options.message ?? DEFAULT_MESSAGES[options.code], {
      ...(options.cause === undefined ? {} : { cause: options.cause }),
    });
    this.name = "ModelInvocationError";
    this.code = options.code;
    this.retryable = RETRYABLE_CODES.has(options.code);
    if (options.providerCode !== undefined) {
      this.providerCode = options.providerCode;
    }
    if (options.status !== undefined) {
      this.status = options.status;
    }
  }
}

export function isModelInvocationError(error: unknown): error is ModelInvocationError {
  return error instanceof ModelInvocationError;
}

type ErrorLike = Readonly<{
  code?: unknown;
  name?: unknown;
  status?: unknown;
}>;

function errorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? error : {};
}

function providerCode(error: unknown): string | undefined {
  const code = errorLike(error).code;
  return typeof code === "string" ? code : undefined;
}

function providerStatus(error: unknown): number | undefined {
  const status = errorLike(error).status;
  return typeof status === "number" ? status : undefined;
}

function errorName(error: unknown): string | undefined {
  const name = errorLike(error).name;
  return typeof name === "string" ? name : undefined;
}

function abortedError(
  error: unknown,
  signal?: AbortSignal,
): ModelInvocationError | null {
  const signalReasonName =
    signal?.reason instanceof Error ? signal.reason.name : undefined;
  const name = errorName(error);

  if (signal?.aborted && signalReasonName === "TimeoutError") {
    return new ModelInvocationError({
      cause: error,
      code: "TIMED_OUT",
    });
  }
  if (signal?.aborted || name === "AbortError") {
    return new ModelInvocationError({
      cause: error,
      code: "ABORTED",
    });
  }
  if (name === "TimeoutError") {
    return new ModelInvocationError({
      cause: error,
      code: "TIMED_OUT",
    });
  }
  return null;
}

/** Converts provider failures into the package's stable error contract. */
export function normaliseModelInvocationError(
  error: unknown,
  signal?: AbortSignal,
): ModelInvocationError {
  if (isModelInvocationError(error)) {
    return error;
  }

  const aborted = abortedError(error, signal);
  if (aborted) {
    return aborted;
  }

  const status = providerStatus(error);
  const code = providerCode(error);
  const metadata = {
    cause: error,
    ...(code === undefined ? {} : { providerCode: code }),
    ...(status === undefined ? {} : { status }),
  };

  if (status === 429) {
    return new ModelInvocationError({
      ...metadata,
      code: "RATE_LIMITED",
    });
  }
  if (status === 401 || status === 403) {
    return new ModelInvocationError({
      ...metadata,
      code: "AUTHENTICATION_FAILED",
    });
  }
  // Unlike other 4xx responses, request timeouts are retryable.
  if (status === 408) {
    return new ModelInvocationError({
      ...metadata,
      code: "TIMED_OUT",
    });
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return new ModelInvocationError({
      ...metadata,
      code: "INVALID_REQUEST",
    });
  }
  if (status !== undefined && status >= 500) {
    return new ModelInvocationError({
      ...metadata,
      code: "PROVIDER_UNAVAILABLE",
    });
  }

  return new ModelInvocationError({
    ...metadata,
    code: "PROVIDER_ERROR",
  });
}
