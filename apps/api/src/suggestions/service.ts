import { preparePrompt, type PreparedPrompt } from "@oaknational/resource-adapter-ai";
import {
  getResourceNodesByType,
  type ResourceDocument,
} from "@oaknational/resource-document";
import { z } from "zod";

import type { ResourceAdapterModelInvoker } from "../ai/model-roles";
import { serialiseResourceDocumentForPrompt } from "../transformations/prompt-input";
import {
  isRegisteredTransformationKind,
  transformationDefinitions,
} from "../transformations/registry";
import { evaluateTransformations } from "../transformations/service";
import type {
  AppliedTransformationSummary,
  AvailableTransformation,
  TransformationDefinition,
} from "../transformations/types";
import { suggestionPedagogyPart } from "./prompt-parts/pedagogy.part";
import type { SuggestionFlowDefinition, TransformationSuggestion } from "./types";

type RawSuggestion = Readonly<{
  kind: string;
  params: Readonly<Record<string, unknown>>;
  reason: string;
  targetBlockId: string | null;
}>;

type SuggestionPreparation = Readonly<{
  candidates: readonly SuggestionCandidate[];
  preparedPrompt: PreparedPrompt;
}>;

export type EligibleSuggestionTargets =
  | Readonly<{ scope: "document" }>
  | Readonly<{ blockIds: readonly [string, ...string[]]; scope: "node" }>;

export type SuggestionCandidate = AvailableTransformation &
  Readonly<{ eligibleTargets: EligibleSuggestionTargets }>;

export type PrepareSuggestionPrompt = typeof preparePrompt;

function targetBlockIdSchemaFor(candidate: SuggestionCandidate) {
  if (candidate.eligibleTargets.scope === "document") {
    return z.null();
  }
  const [firstTargetBlockId, ...remainingTargetBlockIds] =
    candidate.eligibleTargets.blockIds;
  return z.enum([firstTargetBlockId, ...remainingTargetBlockIds]);
}

function rawSuggestionSchemaFor(
  candidates: readonly SuggestionCandidate[],
): z.ZodType<RawSuggestion> {
  const options = candidates.map((candidate) => {
    if (!isRegisteredTransformationKind(candidate.kind)) {
      throw new Error(`Unknown transformation ${candidate.kind}.`);
    }
    return z.strictObject({
      kind: z.literal(candidate.kind),
      params: transformationDefinitions[candidate.kind].params,
      reason: z.string().trim().min(1).max(240),
      targetBlockId: targetBlockIdSchemaFor(candidate),
    }) as z.ZodType<RawSuggestion>;
  });
  const [first, second, ...rest] = options;
  if (first === undefined) {
    throw new Error("A suggestion schema needs at least one candidate.");
  }
  return second === undefined
    ? first
    : (z.union([first, second, ...rest]) as z.ZodType<RawSuggestion>);
}

function renderCandidates(candidates: readonly SuggestionCandidate[]): string {
  return candidates
    .map((candidate) => {
      const target =
        candidate.eligibleTargets.scope === "document"
          ? "whole document"
          : `one of these eligible node IDs: ${candidate.eligibleTargets.blockIds.join(", ")}`;
      const levels = candidate.supportLevels
        ?.map(({ description, level }) => `${level}: ${description}`)
        .join("; ");

      return [
        `Kind: ${candidate.kind}`,
        `Label: ${candidate.label}`,
        `Description: ${candidate.suggestion.description}`,
        `Use when: ${candidate.suggestion.useWhen}`,
        `Avoid when: ${candidate.suggestion.avoidWhen}`,
        `Target: ${target}`,
        ...(levels === undefined ? [] : [`Support levels: ${levels}`]),
      ].join("\n");
    })
    .join("\n\n");
}

function candidateForDefinition(
  definition: TransformationDefinition,
  document: ResourceDocument,
  appliedTransformations: readonly AppliedTransformationSummary[],
  flow: SuggestionFlowDefinition,
): SuggestionCandidate | null {
  const context = {
    appliedTransformations,
    capabilityId: flow.capabilityId,
    document,
  };
  if (definition.target.scope === "document") {
    const [candidate] = evaluateTransformations([definition], context);
    return candidate === undefined
      ? null
      : { ...candidate, eligibleTargets: { scope: "document" } };
  }

  const [firstTargetBlockId, ...remainingTargetBlockIds] =
    definition.target.nodeTypes.flatMap((nodeType) =>
      getResourceNodesByType(document, nodeType)
        .filter(
          ({ id }) =>
            evaluateTransformations([definition], {
              ...context,
              targetBlockId: id,
            }).length > 0,
        )
        .map(({ id }) => id),
    );
  if (firstTargetBlockId === undefined) {
    return null;
  }

  const [candidate] = evaluateTransformations([definition], {
    ...context,
    targetBlockId: firstTargetBlockId,
  });
  if (candidate === undefined) {
    throw new Error(`${definition.kind} lost its eligible target.`);
  }
  return {
    ...candidate,
    eligibleTargets: {
      blockIds: [firstTargetBlockId, ...remainingTargetBlockIds],
      scope: "node",
    },
  };
}

export async function prepareSuggestionFlow(
  flow: SuggestionFlowDefinition,
  document: ResourceDocument,
  appliedTransformations: readonly AppliedTransformationSummary[],
  prepare: PrepareSuggestionPrompt = preparePrompt,
): Promise<SuggestionPreparation> {
  const definitions = flow.transformationKinds.map(
    (kind) => transformationDefinitions[kind],
  );
  const candidates = definitions
    .map((definition) =>
      candidateForDefinition(definition, document, appliedTransformations, flow),
    )
    .filter((candidate): candidate is SuggestionCandidate => candidate !== null);
  const preparedPrompt = await prepare({
    template: flow.prompt,
    variables: {
      document: serialiseResourceDocumentForPrompt(document),
      pedagogy: suggestionPedagogyPart(),
      transformations: renderCandidates(candidates),
    },
  });

  return { candidates, preparedPrompt };
}

/**
 * A suggestion the model returns for a target that has since become unavailable
 * is dropped rather than failing the batch, so one stale offer does not cost the
 * teacher the rest.
 */
function validatedSuggestion(
  raw: RawSuggestion,
  candidates: readonly SuggestionCandidate[],
  document: ResourceDocument,
  flow: SuggestionFlowDefinition,
  appliedTransformations: readonly AppliedTransformationSummary[],
): TransformationSuggestion | null {
  const candidate = candidates.find(({ kind }) => kind === raw.kind);
  if (candidate === undefined || !isRegisteredTransformationKind(candidate.kind)) {
    return null;
  }

  const definition = transformationDefinitions[
    candidate.kind
  ] as TransformationDefinition;
  const params = definition.params.safeParse(raw.params);
  const targetIsEligible =
    candidate.eligibleTargets.scope === "document"
      ? raw.targetBlockId === null
      : raw.targetBlockId !== null &&
        candidate.eligibleTargets.blockIds.includes(raw.targetBlockId);
  if (!params.success || !targetIsEligible) {
    return null;
  }
  const stillAvailable = evaluateTransformations([definition], {
    appliedTransformations,
    capabilityId: flow.capabilityId,
    document,
    targetBlockId: raw.targetBlockId ?? undefined,
  });
  if (stillAvailable.length === 0) {
    return null;
  }

  return {
    kind: candidate.kind,
    label: candidate.label,
    params: params.data,
    reason: raw.reason,
    targetBlockId: raw.targetBlockId,
  };
}

export async function generateSuggestions(
  flow: SuggestionFlowDefinition,
  document: ResourceDocument,
  appliedTransformations: readonly AppliedTransformationSummary[],
  config: Readonly<{
    invoker: ResourceAdapterModelInvoker;
    prepare?: PrepareSuggestionPrompt | undefined;
    correlationKey?: string | undefined;
    signal?: AbortSignal | undefined;
  }>,
): Promise<readonly TransformationSuggestion[]> {
  const { candidates, preparedPrompt } = await prepareSuggestionFlow(
    flow,
    document,
    appliedTransformations,
    config.prepare,
  );
  if (candidates.length === 0) {
    return [];
  }

  const schema = z.strictObject({
    suggestions: z.array(rawSuggestionSchemaFor(candidates)).max(flow.maxSuggestions),
  });
  const result = await config.invoker.invokeStructured({
    ...(config.correlationKey === undefined
      ? {}
      : { correlationKey: config.correlationKey }),
    promptTemplateId: preparedPrompt.promptTemplateId,
    request: { input: preparedPrompt.text },
    role: flow.role,
    schema,
    schemaName: "transformation_suggestions",
    ...(config.signal === undefined ? {} : { signal: config.signal }),
  });
  if (result.outcome !== "SUCCESS") {
    throw new Error(`Suggestion generation ended with ${result.outcome}.`);
  }

  const seen = new Set<string>();
  return result.output.suggestions.flatMap((raw) => {
    const suggestion = validatedSuggestion(
      raw,
      candidates,
      document,
      flow,
      appliedTransformations,
    );
    if (suggestion === null) {
      return [];
    }
    const identity = `${suggestion.kind}:${suggestion.targetBlockId ?? "document"}`;
    if (seen.has(identity)) {
      return [];
    }
    seen.add(identity);
    return [suggestion];
  });
}
