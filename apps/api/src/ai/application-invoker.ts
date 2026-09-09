import OpenAI from "openai";
import {
  createDatabaseInvocationRecorder,
  createDeterministicModelTransport,
  createModelInvoker,
  createOpenAIResponsesTransport,
} from "@oaknational/resource-adapter-ai";

import { resolveDeterministicResponse } from "./deterministic-responses";
import { resolveModelTransport } from "./model-configuration";
import {
  modelRoleBindings,
  rebindModelRoles,
  type ResourceAdapterModelInvoker,
} from "./model-roles";

export function createApplicationModelInvoker(
  transformationAttemptId: string,
): ResourceAdapterModelInvoker {
  const transport = resolveModelTransport();
  if (transport === "deterministic") {
    return createModelInvoker({
      recorder: createDatabaseInvocationRecorder({ transformationAttemptId }),
      roleBindings: rebindModelRoles("deterministic"),
      transports: {
        deterministic: createDeterministicModelTransport({
          resolve: resolveDeterministicResponse,
        }),
      },
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
