import OpenAI from "openai";
import {
  createConsoleInvocationRecorder,
  createModelInvoker,
  createOpenAIResponsesTransport,
  ModelInvocationError,
  type TextModelOutputResult,
} from "@oaknational/resource-adapter-ai";

import { createConfiguredModelInvoker } from "./configured-invoker";
import { maxOutputTokens, modelRoleBindings } from "./model-roles";
import type { ResourceAdapterModelInvoker } from "./model-roles";

export function createDevModelInvoker(): ResourceAdapterModelInvoker {
  return createConfiguredModelInvoker(createConsoleInvocationRecorder);
}

/** Always OpenAI, whatever `MODEL_TRANSPORT` says: for checks that mean nothing against canned responses. */
export function createOpenAIModelInvoker(): ResourceAdapterModelInvoker {
  if (!process.env.OPENAI_API_KEY) {
    throw new ModelInvocationError({
      code: "INVALID_CONFIGURATION",
      message: "OPENAI_API_KEY is not configured.",
    });
  }

  return createModelInvoker({
    recorder: createConsoleInvocationRecorder(),
    roleBindings: modelRoleBindings,
    transports: {
      openai: createOpenAIResponsesTransport({ client: new OpenAI() }),
    },
  });
}

export async function invokeDevSmokeText(
  input: string,
): Promise<TextModelOutputResult> {
  return createOpenAIModelInvoker().invokeText({
    correlationKey: "dev-ai-invoke",
    request: { input, max_output_tokens: maxOutputTokens["dev-smoke"] },
    role: "dev-smoke",
  });
}
