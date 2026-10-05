import type { ModelId, ModelProvider } from "./model-catalogue.js";
import type { ModelInvocationRequest, ModelProviderRequest } from "./protocol.js";

export type ModelInvocationIdentity = Readonly<{
  correlationKey?: string;
  invocationId: string;
  model: ModelId;
  promptTemplateId?: string;
  provider: ModelProvider;
  role: string;
  /**
   * The teacher's Clerk user ID. A transport maps it to its provider's
   * attribution field, if there is one.
   */
  subject?: string;
  transport: string;
}>;

export type ModelTransportInvocation = ModelInvocationIdentity &
  Readonly<{ request: ModelInvocationRequest }>;

export type ResolvedModelInvocation = ModelInvocationIdentity &
  Readonly<{ request: ModelProviderRequest }>;
