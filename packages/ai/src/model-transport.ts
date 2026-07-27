import type { ModelInvocationResponse } from "./protocol.js";
import type { ResolvedModelInvocation } from "./resolved-invocation.js";

export type ModelTransportOptions = Readonly<{
  signal: AbortSignal;
}>;

/**
 * Executes one model invocation using a configured direct provider, external
 * gateway, or internal model service.
 *
 * Implementations must forward `options.signal` to the underlying client so
 * that callers and invocation timeouts can abort in-flight work.
 */
export interface ModelTransport {
  invoke(
    invocation: ResolvedModelInvocation,
    options: ModelTransportOptions,
  ): Promise<ModelInvocationResponse>;
}
