import { renderPromptTemplate } from "@oaknational/resource-adapter-ai";
import type { LessonIdentity } from "@oaknational/resource-adapter-curriculum";
import type {
  SuggestionCatalogue,
  SuggestionFlow,
  SuggestionPreview,
  SuggestionRunResponse,
} from "@oaknational/resource-adapter-dev-api-contracts";
import type { ResourceDocument } from "@oaknational/resource-document";

import { createDevModelInvoker } from "../ai/dev-invoker";
import { requireCapability } from "../capabilities/registry";
import { suggestionFlowDefinitions } from "./registry";
import {
  generateSuggestions,
  prepareSuggestionFlow,
  suggestionMaterialRequirements,
  type PrepareSuggestionPrompt,
} from "./service";
import type { SuggestionLessonContext } from "./types";
import { toAvailableTransformation } from "../transformations/service";
import { readLessonFacts } from "../curriculum/read-lesson-facts";
import { resolveApplicationMaterial } from "../transformations/application-material-resolver";
import type { AppliedTransformationSummary } from "../transformations/types";

export type DevSuggestionCommand = Readonly<{
  appliedTransformations: readonly AppliedTransformationSummary[];
  document: ResourceDocument;
  flowId: string;
  lesson?: LessonIdentity | undefined;
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

function describeFlow(flow: ReturnType<typeof resolveFlow>): SuggestionFlow {
  return {
    capabilityId: flow.capabilityId,
    id: flow.id,
    label: requireCapability(flow.capabilityId).label,
    maxSuggestions: flow.maxSuggestions,
    role: flow.role,
    transformationKinds: flow.transformationKinds,
  };
}

export function getDevSuggestionCatalogue(): SuggestionCatalogue {
  return {
    flows: Object.values(suggestionFlowDefinitions).map(describeFlow),
  };
}

async function lessonFor(
  flow: ReturnType<typeof resolveFlow>,
  command: DevSuggestionCommand,
): Promise<SuggestionLessonContext> {
  const [{ material }, facts] = await Promise.all([
    resolveApplicationMaterial(
      suggestionMaterialRequirements(flow),
      command.lesson,
      createDevModelInvoker,
    ),
    readLessonFacts(command.lesson),
  ]);
  return { identity: command.lesson ?? null, material, facts };
}

export async function previewDevSuggestionFlow(
  command: DevSuggestionCommand,
): Promise<SuggestionPreview> {
  const flow = resolveFlow(command.flowId);
  const { candidates, preparedPrompt } = await prepareSuggestionFlow(
    flow,
    command.document,
    command.appliedTransformations,
    await lessonFor(flow, command),
    prepareWithoutPersistence,
  );

  return {
    candidates: candidates.map(({ definition, eligibleTargets }) => ({
      ...toAvailableTransformation(definition),
      eligibleTargets,
    })),
    flow: describeFlow(flow),
    prompt: {
      identifier: flow.prompt.identifier,
      text: preparedPrompt.text,
    },
  };
}

export async function runDevSuggestionFlow(
  command: DevSuggestionCommand,
): Promise<SuggestionRunResponse> {
  const flow = resolveFlow(command.flowId);
  const suggestions = await generateSuggestions(
    flow,
    command.document,
    command.appliedTransformations,
    {
      correlationKey: `dev-suggestions-${flow.id}`,
      createInvoker: createDevModelInvoker,
      lesson: await lessonFor(flow, command),
      prepare: prepareWithoutPersistence,
    },
  );

  return { flowId: flow.id, suggestions };
}
