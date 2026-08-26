import { renderPromptTemplate } from "@oaknational/resource-adapter-ai";
import type { ResourceDocument } from "@oaknational/resource-document";

import { createDevModelInvoker } from "../ai/dev-invoker";
import { suggestionFlowDefinitions } from "./registry";
import {
  generateSuggestions,
  prepareSuggestionFlow,
  type PrepareSuggestionPrompt,
} from "./service";
import type { AppliedTransformationSummary } from "../transformations/types";

export type DevSuggestionCommand = Readonly<{
  appliedTransformations: readonly AppliedTransformationSummary[];
  document: ResourceDocument;
  flowId: string;
}>;

export class SuggestionRequestError extends Error {
  override readonly name = "SuggestionRequestError";
}

const prepareWithoutPersistence: PrepareSuggestionPrompt = ({ template, variables }) =>
  Promise.resolve({
    promptTemplateId: `dev-${template.hash}`,
    text: renderPromptTemplate(template, variables),
  });

function resolveFlow(flowId: string) {
  const flow = Object.values(suggestionFlowDefinitions).find(
    (candidate) => candidate.id === flowId,
  );
  if (flow === undefined) {
    throw new SuggestionRequestError(`Unknown suggestion flow ${flowId}.`);
  }
  return flow;
}

function describeFlow(flow: ReturnType<typeof resolveFlow>) {
  return {
    capabilityId: flow.capabilityId,
    id: flow.id,
    maxSuggestions: flow.maxSuggestions,
    role: flow.role,
    transformationKinds: flow.transformationKinds,
  };
}

export function getDevSuggestionCatalogue() {
  return {
    flows: Object.values(suggestionFlowDefinitions).map(describeFlow),
  };
}

export async function previewDevSuggestionFlow(command: DevSuggestionCommand) {
  const flow = resolveFlow(command.flowId);
  const { candidates, preparedPrompt } = await prepareSuggestionFlow(
    flow,
    command.document,
    command.appliedTransformations,
    prepareWithoutPersistence,
  );

  return {
    candidates,
    flow: describeFlow(flow),
    prompt: {
      identifier: flow.prompt.identifier,
      text: preparedPrompt.text,
    },
  };
}

export async function runDevSuggestionFlow(command: DevSuggestionCommand) {
  const flow = resolveFlow(command.flowId);
  const suggestions = await generateSuggestions(
    flow,
    command.document,
    command.appliedTransformations,
    {
      correlationKey: `dev-suggestions-${flow.id}`,
      invoker: createDevModelInvoker(),
      prepare: prepareWithoutPersistence,
    },
  );

  return { flowId: flow.id, suggestions };
}
