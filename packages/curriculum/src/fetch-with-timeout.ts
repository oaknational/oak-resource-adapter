import { CurriculumError } from "./errors.js";

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
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await read(await fetch(url, { ...init, signal: controller.signal }));
  } catch (error) {
    if (timedOut) {
      throw new CurriculumError(`Oak did not answer within ${timeoutMs}ms`, {
        cause: error,
        code: "timed-out",
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
