import OpenAI from "openai";
import {
  createDeterministicModelTransport,
  createModelInvoker,
  createOpenAIResponsesTransport,
  type InvocationRecorder,
} from "@oaknational/resource-adapter-ai";

import { resolveDeterministicResponse } from "./deterministic-responses";
import { resolveModelTransport } from "./model-configuration";
import {
  modelRoleBindings,
  rebindModelRoles,
  type ResourceAdapterModelInvoker,
} from "./model-roles";

export function createConfiguredModelInvoker(
  createRecorder: () => InvocationRecorder,
  userId?: string,
): ResourceAdapterModelInvoker {
  const transport = resolveModelTransport();
  const config = {
    recorder: createRecorder(),
    ...(userId === undefined ? {} : { userId }),
  };

  if (transport === "deterministic") {
    return createModelInvoker({
      ...config,
      roleBindings: rebindModelRoles("deterministic"),
      transports: {
        deterministic: createDeterministicModelTransport({
          resolve: resolveDeterministicResponse,
        }),
      },
    });
  }

  return createModelInvoker({
    ...config,
    roleBindings: modelRoleBindings,
    transports: {
      openai: createOpenAIResponsesTransport({ client: new OpenAI() }),
    },
  });
}
