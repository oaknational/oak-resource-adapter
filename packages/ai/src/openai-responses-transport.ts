import {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  type default as OpenAI,
} from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseTextConfig,
} from "openai/resources/responses/responses";

import { jsonObjectSnapshot, jsonSnapshot } from "./json-snapshot.js";
import {
  ModelInvocationError,
  isModelInvocationError,
  normaliseModelInvocationError,
  type ModelInvocationErrorCode,
} from "./model-invocation-error.js";
import type { ModelOutputRequirement } from "./model-output.js";
import type { ModelTransport, ModelTransportResult } from "./model-transport.js";
import type {
  ModelIncompleteReason,
  ModelResponseOutput,
  ModelResponseRecord,
} from "./protocol.js";

export type OpenAIResponsesTransportConfig = Readonly<{
  client: Pick<OpenAI, "responses">;
}>;

/** Uses the SDK as the source of truth for OpenAI's strict JSON Schema subset. */
function structuredFormat(
  output: Extract<ModelOutputRequirement, { kind: "STRUCTURED" }>,
): NonNullable<ResponseTextConfig["format"]> {
  try {
    return zodTextFormat(output.schema, output.name);
  } catch (error) {
    throw new ModelInvocationError({
      cause: error,
      code: "INVALID_CONFIGURATION",
      message: `The output schema cannot be represented as a strict OpenAI JSON Schema: ${
        error instanceof Error ? error.message : "conversion failed"
      }`,
    });
  }
}

function requestForOutput(
  request: ResponseCreateParamsNonStreaming,
  output: ModelOutputRequirement,
): ResponseCreateParamsNonStreaming {
  switch (output.kind) {
    case "PROVIDER_DEFAULT":
      return request;
    case "TEXT":
      return {
        ...request,
        text: {
          ...request.text,
          format: { type: "text" },
        },
      };
    case "STRUCTURED":
      return {
        ...request,
        text: {
          ...request.text,
          format: structuredFormat(output),
        },
      };
  }
}

function incompleteReason(response: Response): ModelIncompleteReason {
  switch (response.incomplete_details?.reason) {
    case "content_filter":
      return "CONTENT_FILTER";
    case "max_output_tokens":
      return "MAX_OUTPUT_TOKENS";
    default:
      return "UNKNOWN";
  }
}

function responseFailure(response: Response): ModelInvocationError {
  const error = response.error;
  if (!error) {
    return new ModelInvocationError({ code: "PROVIDER_ERROR" });
  }

  let code: ModelInvocationErrorCode = "INVALID_REQUEST";
  if (error.code === "rate_limit_exceeded") {
    code = "RATE_LIMITED";
  } else if (error.code === "server_error" || error.code === "vector_store_timeout") {
    code = "PROVIDER_UNAVAILABLE";
  }

  return new ModelInvocationError({
    cause: error,
    code,
    providerCode: error.code,
  });
}

function normaliseOpenAIError(
  error: unknown,
  signal: AbortSignal,
): ModelInvocationError {
  if (isModelInvocationError(error)) {
    return error;
  }
  if (signal.aborted) {
    return normaliseModelInvocationError(error, signal);
  }
  // This API returns 409 for a lock timeout rather than the state conflict the
  // status usually denotes, making it worth retrying where a general 409 — which
  // the caller must resolve before resubmitting — is not. 408 needs no special
  // case: it is transient for any provider.
  if (error instanceof APIError && error.status === 409) {
    return new ModelInvocationError({
      cause: error,
      code: "PROVIDER_UNAVAILABLE",
      ...(error.code === null || error.code === undefined
        ? {}
        : { providerCode: error.code }),
      status: error.status,
    });
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new ModelInvocationError({
      cause: error,
      code: "TIMED_OUT",
    });
  }
  if (error instanceof APIUserAbortError) {
    return new ModelInvocationError({
      cause: error,
      code: "ABORTED",
    });
  }
  if (error instanceof APIConnectionError) {
    return new ModelInvocationError({
      cause: error,
      code: "PROVIDER_UNAVAILABLE",
    });
  }
  return normaliseModelInvocationError(error, signal);
}

function responseRecord(response: Response): ModelResponseRecord {
  return {
    providerResponseId: response.id,
    rawResponse: jsonSnapshot(response),
    ...(response.usage
      ? {
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.total_tokens,
          },
        }
      : {}),
  };
}

function successfulResponse(
  response: ModelResponseRecord,
  output: ModelResponseOutput,
): ModelTransportResult {
  return { kind: "SUCCESS", response: { ...response, output } };
}

function failedResponse(
  response: ModelResponseRecord,
  error: ModelInvocationError,
): ModelTransportResult {
  return { error, kind: "FAILURE", response };
}

function normaliseResponse(response: Response): ModelTransportResult {
  const base = responseRecord(response);

  if (response.error || response.status === "failed") {
    return failedResponse(base, responseFailure(response));
  }
  if (response.status === "cancelled") {
    return failedResponse(base, new ModelInvocationError({ code: "ABORTED" }));
  }
  if (response.status === "queued" || response.status === "in_progress") {
    return failedResponse(base, new ModelInvocationError({ code: "PROVIDER_ERROR" }));
  }
  if (response.status === "incomplete") {
    return successfulResponse(base, {
      kind: "INCOMPLETE",
      reason: incompleteReason(response),
    });
  }

  const messages = response.output.filter((item) => item.type === "message");
  const refusal = messages
    .flatMap((message) => message.content)
    .find((content) => content.type === "refusal");
  if (refusal) {
    return successfulResponse(base, { kind: "REFUSAL", refusal: refusal.refusal });
  }

  const textParts = messages
    .flatMap((message) => message.content)
    .filter((content) => content.type === "output_text");
  if (textParts.length > 0) {
    return successfulResponse(base, {
      kind: "TEXT",
      text: textParts.map((part) => part.text).join(""),
    });
  }
  if (response.output_text.length > 0) {
    return successfulResponse(base, { kind: "TEXT", text: response.output_text });
  }

  return successfulResponse(base, { kind: "MISSING" });
}

export function createOpenAIResponsesTransport(
  config: OpenAIResponsesTransportConfig,
): ModelTransport {
  return {
    prepare(invocation, output) {
      const request = requestForOutput(
        {
          ...invocation.request,
          model: invocation.model,
          // This API retains prompts and output for 30 days by default. Opt out
          // unless a caller has asked for provider-side retention, which
          // `previous_response_id` needs.
          store: invocation.request.store ?? false,
          stream: false,
        },
        output,
      );

      return {
        request: jsonObjectSnapshot(request),
        async execute(options) {
          try {
            const response = await config.client.responses.create(request, {
              signal: options.signal,
            });
            return normaliseResponse(response);
          } catch (error) {
            throw normaliseOpenAIError(error, options.signal);
          }
        },
      };
    },
  };
}
