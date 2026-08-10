import OpenAI from "openai";
import {
  createConsoleInvocationRecorder,
  createModelInvoker,
  createOpenAIResponsesTransport,
  defineRoleBindings,
  ModelInvocationError,
  type TextModelOutputResult,
} from "@oaknational/resource-adapter-ai";

const devRoleBindings = defineRoleBindings({
  "dev-smoke": {
    model: "gpt-5.6-luna",
    transport: "openai",
  },
});

/**
 * Runs one text invocation for the dev route.
 *
 * A fresh invoker per call: the OpenAI client reads `OPENAI_API_KEY` at
 * construction, so anything module-scoped would make `next build` and server
 * boot require the key. The output cap is set here, server-side, so a dev
 * request cannot run up cost.
 */
export function invokeDevSmokeText(input: string): Promise<TextModelOutputResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new ModelInvocationError({
      code: "INVALID_CONFIGURATION",
      message: "OPENAI_API_KEY is not configured.",
    });
  }

  const invoker = createModelInvoker({
    recorder: createConsoleInvocationRecorder(),
    roleBindings: devRoleBindings,
    transports: {
      openai: createOpenAIResponsesTransport({ client: new OpenAI() }),
    },
  });

  return invoker.invokeText({
    correlationKey: "dev-ai-invoke",
    request: { input, max_output_tokens: 256 },
    role: "dev-smoke",
  });
}
