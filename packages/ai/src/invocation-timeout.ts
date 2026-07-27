export const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * `setTimeout` truncates any delay above the 32-bit signed maximum to 1ms, so an
 * over-large timeout aborts almost immediately rather than never.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

export function validateTimeoutMs(timeoutMs: number, field: string): number {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(
      `${field} must be an integer between 1 and ${MAX_TIMEOUT_MS}.`,
    );
  }

  return timeoutMs;
}

/** Composes caller-owned cancellation with the invocation's timeout. */
export function resolveSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}
