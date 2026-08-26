import OpenAI from "openai";
import {
  createDatabaseInvocationRecorder,
  createModelInvoker,
  createOpenAIResponsesTransport,
  ModelInvocationError,
} from "@oaknational/resource-adapter-ai";

import { modelRoleBindings, type ResourceAdapterModelInvoker } from "./model-roles";

export function createApplicationModelInvoker(
  transformationAttemptId: string,
): ResourceAdapterModelInvoker {
  if (!process.env.OPENAI_API_KEY) {
    throw new ModelInvocationError({
      code: "INVALID_CONFIGURATION",
      message: "OPENAI_API_KEY is not configured.",
    });
  }

  return createModelInvoker({
    recorder: createDatabaseInvocationRecorder({ transformationAttemptId }),
    roleBindings: modelRoleBindings,
    transports: {
      openai: createOpenAIResponsesTransport({ client: new OpenAI() }),
    },
  });
}
