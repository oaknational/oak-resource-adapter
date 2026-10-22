export type DeadlineResult<T> =
  | Readonly<{ kind: "completed"; value: T }>
  | Readonly<{ kind: "timed-out"; error: unknown }>
  | Readonly<{ kind: "aborted"; error: unknown }>
  | Readonly<{ kind: "failed"; error: unknown }>;

function rejectWhenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/**
 * The abort is recorded rather than recognised from what `fetch` throws: undici
 * can surface it as a `TypeError` wrapping an `AbortError` instead of the
 * `DOMException` the spec describes, so sniffing the rejection misses timeouts.
 */
export async function withDeadline<T>(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<DeadlineResult<T>> {
  const controller = new AbortController();
  let firstAbort: "timed-out" | "aborted" | undefined;
  const timer = setTimeout(() => {
    firstAbort ??= "timed-out";
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => {
    firstAbort ??= "aborted";
    controller.abort(callerSignal?.reason);
  };
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    const value = await Promise.race([
      work(controller.signal),
      rejectWhenAborted(controller.signal),
    ]);
    return { kind: "completed", value };
  } catch (error) {
    return firstAbort === undefined
      ? { kind: "failed", error }
      : { kind: firstAbort, error };
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}
