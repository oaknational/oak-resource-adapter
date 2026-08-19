import OpenAI from "openai";
import {
  createConsoleInvocationRecorder,
  createModelInvoker,
  createOpenAIResponsesTransport,
  ModelInvocationError,
  type TextModelOutputResult,
} from "@oaknational/resource-adapter-ai";

import { modelRoleBindings } from "./model-roles";
import type { ResourceAdapterModelInvoker } from "./model-roles";

export function createDevModelInvoker(): ResourceAdapterModelInvoker {
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
  return createDevModelInvoker().invokeText({
    correlationKey: "dev-ai-invoke",
    request: { input, max_output_tokens: 256 },
    role: "dev-smoke",
  });
}
