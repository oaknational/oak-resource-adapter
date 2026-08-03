import type { ModelOutputRequirement } from "./model-output.js";
import type { ModelInvocationError } from "./model-invocation-error.js";
import type {
  ModelInvocationResponse,
  ModelProviderRequest,
  ModelResponseRecord,
} from "./protocol.js";
import type { ModelTransportInvocation } from "./resolved-invocation.js";

export type ModelTransportOptions = Readonly<{
  signal: AbortSignal;
}>;

export type ModelTransportResult =
  | Readonly<{
      kind: "FAILURE";
      error: ModelInvocationError;
      response: ModelResponseRecord;
    }>
  | Readonly<{ kind: "SUCCESS"; response: ModelInvocationResponse }>;

export type PreparedModelInvocation = Readonly<{
  execute(options: ModelTransportOptions): Promise<ModelTransportResult>;
  request: ModelProviderRequest;
}>;

/**
 * `prepare` must not call the provider: its exact request is recorded before
 * `execute`. Returned failures carry a response to audit; failures without one
 * are thrown.
 */
export interface ModelTransport {
  prepare(
    invocation: ModelTransportInvocation,
    output: ModelOutputRequirement,
  ): PreparedModelInvocation;
}
