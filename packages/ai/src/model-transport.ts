import type { ModelId, ModelProvider } from "./model-catalogue.js";
import type { ModelInvocationRequest, ModelInvocationResponse } from "./protocol.js";

/**
 * The full description of one resolved invocation.
 *
 * This is also what the {@link InvocationRecorder} receives, so every field is
 * plain data and safe to persist. Per-call controls such as `AbortSignal` are
 * deliberately kept out and passed via {@link ModelTransportOptions} instead.
 */
export type ResolvedModelInvocation = Readonly<{
  /**
   * Ties this invocation back to the unit of work that caused it, such as a
   * workflow step ID. This is correlation metadata only — it grants no
   * idempotency, and the invoker does not deduplicate on it.
   */
  correlationKey?: string;
  invocationId: string;
  model: ModelId;
  provider: ModelProvider;
  request: ModelInvocationRequest;
  role: string;
  transport: string;
}>;

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
