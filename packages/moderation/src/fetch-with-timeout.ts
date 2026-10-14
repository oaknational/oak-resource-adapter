export type FetchResult<T> =
  | Readonly<{ kind: "completed"; value: T }>
  | Readonly<{ kind: "timed-out"; error: unknown }>
  | Readonly<{ kind: "aborted"; error: unknown }>
  | Readonly<{ kind: "failed"; error: unknown }>;

/**
 * The abort is recorded rather than recognised from what `fetch` throws: undici
 * can surface it as a `TypeError` wrapping an `AbortError` instead of the
 * `DOMException` the spec describes, so sniffing the rejection misses timeouts.
 */
export async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
  signal?: AbortSignal,
): Promise<FetchResult<T>> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const combined =
    signal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, signal]);

  try {
    return {
      kind: "completed",
      value: await read(await fetch(url, { ...init, signal: combined })),
    };
  } catch (error) {
    if (timedOut) {
      return { kind: "timed-out", error };
    }
    if (signal?.aborted === true) {
      return { kind: "aborted", error };
    }
    return { kind: "failed", error };
  } finally {
    clearTimeout(timer);
  }
}
