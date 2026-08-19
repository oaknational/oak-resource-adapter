import type { ResourceDocument, ResourceNode } from "@oaknational/resource-document";
import type { z } from "zod";

import type { TransformationMaterial } from "../oak-material/material";
import type { SupportLevel } from "../support-level";
import type { TransformationDocuments, TransformationParams } from "../types";

/** Namespaced so a contribution stays identifiable in an exported document. */
export const CONTRIBUTION_EXTENSION_KEY = "oak:contribution";
export const TRANSFORMATION_KIND_EXTENSION_KEY = "oak:transformation-kind";

export type ContributionContext = Readonly<{
  /** Identifies every node this run adds, for later removal or replacement. */
  contributionId: string;
  document: ResourceDocument;
  material: TransformationMaterial;
  params: TransformationParams;
  /** Validated against the definition's declared levels, or absent by design. */
  supportLevel?: SupportLevel | undefined;
  targetNode?: ResourceNode | undefined;
  transformationKind: string;
}>;

export type PreparedContribution = Readonly<{
  /** Receives output already parsed by `schema`; returns declared documents in order. */
  apply: (output: unknown) => TransformationDocuments;
  /** Names the structured output; letters, numbers, underscores and hyphens. */
  name: string;
  schema: z.ZodType;
}>;

type PreparedContributionDefinition<TSchema extends z.ZodType> = Readonly<{
  apply: (output: z.output<TSchema>) => TransformationDocuments;
  name: string;
  schema: TSchema;
}>;

/** Couples a structured-output schema to the value its apply function receives. */
export function definePreparedContribution<TSchema extends z.ZodType>(
  definition: PreparedContributionDefinition<TSchema>,
): PreparedContribution {
  return {
    ...definition,
    apply: (output) => definition.apply(output as z.output<TSchema>),
  };
}

/**
 * Resolves structured output and placement for one validated request. Preparing
 * against the request lets support level or other params select an exact schema.
 */
export type TransformationContribution = Readonly<{
  prepare: (context: ContributionContext) => PreparedContribution;
}>;

export function contributionExtensions(
  context: ContributionContext,
): Readonly<Record<string, string>> {
  return {
    [CONTRIBUTION_EXTENSION_KEY]: context.contributionId,
    [TRANSFORMATION_KIND_EXTENSION_KEY]: context.transformationKind,
  };
}

/**
 * For a contribution whose output contract depends on the level. Params are
 * validated against the definition's levels first, so an absent level means the
 * definition declares none and the two disagree.
 */
export function requireSupportLevel(context: ContributionContext): SupportLevel {
  if (context.supportLevel === undefined) {
    throw new Error(
      `${context.transformationKind} needs a support level, but its definition declares none.`,
    );
  }

  return context.supportLevel;
}
