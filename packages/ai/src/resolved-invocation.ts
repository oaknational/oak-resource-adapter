import type { ModelId, ModelProvider } from "./model-catalogue.js";
import type { ModelInvocationRequest, ModelProviderRequest } from "./protocol.js";

export type ModelInvocationIdentity = Readonly<{
  correlationKey?: string;
  invocationId: string;
  model: ModelId;
  promptTemplateId?: string;
  provider: ModelProvider;
  role: string;
  transport: string;
}>;

export type ModelTransportInvocation = ModelInvocationIdentity &
  Readonly<{ request: ModelInvocationRequest }>;

export type ResolvedModelInvocation = ModelInvocationIdentity &
  Readonly<{ request: ModelProviderRequest }>;
