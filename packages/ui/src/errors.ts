import type { ResourceAdapterErrorHandler } from "./publicTypes.js";

export class ResourceAdapterApiError extends Error {
  public readonly status: number | undefined;

  public constructor(message: string, status?: number) {
    super(message);
    this.name = "ResourceAdapterApiError";
    this.status = status;
  }
}

/** React reports whatever was thrown, which is not necessarily an Error. */
export function toError(thrown: unknown): Error {
  if (thrown instanceof Error) {
    return thrown;
  }

  try {
    return new Error(String(thrown));
  } catch {
    // String() throws on a null-prototype object, and throwing here would
    // unmount the boundary and let the crash reach the host.
    return new Error("Unstringifiable value thrown during render");
  }
}

/** Hands an error to the host. A callback that throws or rejects is swallowed. */
export function reportToHost(
  onError: ResourceAdapterErrorHandler | undefined,
  thrown: unknown,
  componentStack: string | null = null,
): void {
  try {
    void Promise.resolve(onError?.(toError(thrown), { componentStack })).catch(
      () => {},
    );
  } catch {
    // A broken host callback must not affect the caller.
  }
}
