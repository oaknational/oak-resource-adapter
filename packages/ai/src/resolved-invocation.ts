import type { ModelId, ModelProvider } from "./model-catalogue.js";
import type { ModelInvocationRequest } from "./protocol.js";

/**
 * The full description of one resolved invocation.
 *
 * Transports and invocation recorders both receive this, so every field is plain
 * data and safe to persist. Per-call controls such as `AbortSignal` are
 * deliberately kept out and passed as transport options instead.
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
