import { z } from "zod";

import { jsonObjectSnapshot } from "./json-snapshot.js";
import {
  ModelInvocationError,
  normaliseModelInvocationError,
} from "./model-invocation-error.js";
import type { ModelOutputRequirement } from "./model-output.js";
import type { ModelTransport } from "./model-transport.js";
import type { JsonValue } from "./protocol.js";
import type { ModelTransportInvocation } from "./resolved-invocation.js";

export type DeterministicModelResponseResolver = (
  invocation: ModelTransportInvocation,
  output: ModelOutputRequirement,
) => JsonValue;

function responseText(output: ModelOutputRequirement, value: JsonValue): string {
  if (output.kind === "STRUCTURED") {
    return JSON.stringify({ value });
  }
  if (typeof value !== "string") {
    throw new ModelInvocationError({
      code: "INVALID_CONFIGURATION",
      message: "A deterministic text response must be a string.",
    });
  }
  return value;
}

/** Resolvers return the structured value, without the invoker's wire envelope. */
export function createDeterministicModelTransport(
  config: Readonly<{
    resolve: DeterministicModelResponseResolver;
  }>,
): ModelTransport {
  return {
    prepare(invocation, output) {
      const request = jsonObjectSnapshot({
        model: invocation.model,
        request: invocation.request,
        output:
          output.kind === "STRUCTURED"
            ? {
                kind: output.kind,
                name: output.name,
                schema: z.toJSONSchema(output.schema, { io: "input" }),
              }
            : output,
      });
      const text = responseText(output, config.resolve(invocation, output));

      return {
        request,
        async execute({ signal }) {
          if (signal.aborted) {
            throw normaliseModelInvocationError(signal.reason, signal);
          }
          const responseOutput = { kind: "TEXT", text } as const;
          return {
            kind: "SUCCESS",
            response: {
              output: responseOutput,
              rawResponse: { output: responseOutput },
            },
          };
        },
      };
    },
  };
}
