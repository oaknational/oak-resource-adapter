import { preparePrompt, type PreparedPrompt } from "@oaknational/resource-adapter-ai";
import {
  getResourceNodesByType,
  type ResourceDocument,
} from "@oaknational/resource-document";
import { z } from "zod";

import type { ModelInvokerConfig } from "../ai/model-roles";
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
import {
  dismissedTargetIds,
  documentDismissesTransformations,
} from "../transformations/dismissal";
import type { OakMaterial, OakMaterialRequirement } from "../oak-material/material";
import { missingRequiredMaterial } from "../transformations/required-material";
import { suggestionLessonPart } from "./prompt-parts/lesson.part";
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

function transformationDefinitionFor(kind: string): TransformationDefinition {
  if (!isRegisteredTransformationKind(kind)) {
    throw new Error(`Unknown transformation ${kind}.`);
  }
  return transformationDefinitions[kind] as TransformationDefinition;
}

/**
 * The flow's own material, plus whatever a candidate needs before it can be
 * offered, merged by key. A candidate's requirement stays required so that a
 * failed lesson fetch fails the job, which retries, rather than storing
 * suggestions made without knowing which candidates are valid.
 */
export function suggestionMaterialRequirements(
  flow: SuggestionFlowDefinition,
): readonly OakMaterialRequirement[] {
  const requirements = new Map<OakMaterialRequirement["key"], boolean>();
  const required = flow.transformationKinds.flatMap((kind) =>
    (transformationDefinitions[kind].materialRequirements ?? []).filter(
      (requirement) => requirement.required,
    ),
  );
  for (const { key, required: isRequired } of [
    ...flow.materialRequirements,
    ...required,
  ]) {
    requirements.set(key, (requirements.get(key) ?? false) || isRequired);
  }
  return [...requirements].map(([key, isRequired]) => ({ key, required: isRequired }));
}

function renderCandidates(candidates: readonly SuggestionCandidate[]): string {
  return candidates
    .map((candidate) => {
      const target =
        candidate.eligibleTargets.scope === "document"
          ? "whole document"
          : `one of these eligible node IDs: ${candidate.eligibleTargets.blockIds.join(", ")}`;
      const excluded = (transformationDefinitionFor(candidate.kind).excludes ?? []).map(
        (kind) => transformationDefinitionFor(kind).label,
      );
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
        ...(excluded.length === 0
          ? []
          : [`Never on the same target as: ${excluded.join(", ")}`]),
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
  dismissedTargets: ReadonlySet<string>,
  material: OakMaterial,
): SuggestionCandidate | null {
  if (
    missingRequiredMaterial(definition.materialRequirements ?? [], material).length > 0
  ) {
    return null;
  }
  const context = {
    appliedTransformations,
    capabilityId: flow.capabilityId,
    document,
  };
  if (definition.target.scope === "document") {
    if (documentDismissesTransformations(document)) {
      return null;
    }
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
            !dismissedTargets.has(id) &&
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
  material: OakMaterial,
  prepare: PrepareSuggestionPrompt = preparePrompt,
): Promise<SuggestionPreparation> {
  const definitions = flow.transformationKinds.map(
    (kind) => transformationDefinitions[kind],
  );
  const dismissedTargets = dismissedTargetIds(document);
  const candidates = definitions
    .map((definition) =>
      candidateForDefinition(
        definition,
        document,
        appliedTransformations,
        flow,
        dismissedTargets,
        material,
      ),
    )
    .filter((candidate): candidate is SuggestionCandidate => candidate !== null);
  const preparedPrompt = await prepare({
    template: flow.prompt,
    variables: {
      document: serialiseResourceDocumentForPrompt(document),
      lesson: suggestionLessonPart(document, flow.materialRequirements, material),
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

/** Suggestions arrive most useful first, so the earlier of an overlapping pair is kept. */
function overlaps(earlier: TransformationSuggestion, later: TransformationSuggestion) {
  return (
    earlier.targetBlockId === later.targetBlockId &&
    (earlier.kind === later.kind ||
      (transformationDefinitionFor(earlier.kind).excludes ?? []).includes(later.kind))
  );
}

export async function generateSuggestions(
  flow: SuggestionFlowDefinition,
  document: ResourceDocument,
  appliedTransformations: readonly AppliedTransformationSummary[],
  config: Readonly<{
    prepare?: PrepareSuggestionPrompt | undefined;
    material: OakMaterial;
    correlationKey?: string | undefined;
    signal?: AbortSignal | undefined;
  }> &
    ModelInvokerConfig,
): Promise<readonly TransformationSuggestion[]> {
  const { candidates, preparedPrompt } = await prepareSuggestionFlow(
    flow,
    document,
    appliedTransformations,
    config.material,
    config.prepare,
  );
  if (candidates.length === 0) {
    return [];
  }

  const schema = z.strictObject({
    suggestions: z.array(rawSuggestionSchemaFor(candidates)).max(flow.maxSuggestions),
  });
  const result = await config.createInvoker().invokeStructured({
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

  const kept: TransformationSuggestion[] = [];
  for (const raw of result.output.suggestions) {
    const suggestion = validatedSuggestion(
      raw,
      candidates,
      document,
      flow,
      appliedTransformations,
    );
    if (suggestion !== null && !kept.some((earlier) => overlaps(earlier, suggestion))) {
      kept.push(suggestion);
    }
  }
  return kept;
}
