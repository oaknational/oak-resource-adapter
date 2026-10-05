import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonObject = Readonly<{ [key: string]: JsonValue }>;

/**
 * Initially OpenAI-compatible; unlike outputs, this boundary may need
 * normalising when a non-compatible provider is introduced. Streaming and
 * background calls need different lifecycles, so they are excluded. Identity
 * fields are set by transports from the invocation's subject; they are `never`
 * as well as omitted because `Omit` alone only rejects object literals.
 */
export type ModelInvocationRequest = Omit<
  ResponseCreateParamsNonStreaming,
  "background" | "model" | "safety_identifier" | "stream" | "user"
> &
  Readonly<{ safety_identifier?: never; user?: never }>;

export type ModelProviderRequest = JsonObject;

export type ModelIncompleteReason = "CONTENT_FILTER" | "MAX_OUTPUT_TOKENS" | "UNKNOWN";

export type ModelResponseOutput =
  | Readonly<{ kind: "INCOMPLETE"; reason: ModelIncompleteReason }>
  | Readonly<{ kind: "MISSING" }>
  | Readonly<{ kind: "REFUSAL"; refusal: string }>
  | Readonly<{ kind: "TEXT"; text: string }>;

export type ModelUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}>;

export type ModelResponseRecord = Readonly<{
  providerResponseId?: string;
  rawResponse: JsonValue;
  usage?: ModelUsage;
}>;

export type ModelInvocationResponse = ModelResponseRecord &
  Readonly<{ output: ModelResponseOutput }>;
