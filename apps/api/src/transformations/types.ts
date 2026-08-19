import type { PromptTemplate } from "@oaknational/resource-adapter-ai";
import type { ResourceDocument, ResourceNode } from "@oaknational/resource-document";
import type { z } from "zod";

import type { TransformationModelRole } from "../ai/model-roles";
import type { TransformationContribution } from "./contributions/contribution";
import type { TransformationMaterialRequirement } from "./oak-material/material";
import type { SupportLevel, SupportLevelOptions } from "./support-level";

export type TransformationStatus = "active" | "draft";

/** What a transformation reads and changes. Node types also drive target pickers. */
export type TransformationTarget =
  | Readonly<{ scope: "document" }>
  | Readonly<{
      nodeTypes: readonly [ResourceNode["type"], ...ResourceNode["type"][]];
      scope: "node";
    }>;

/** How one produced document participates in an adaptation. */
export type TransformationOutput = "companion-document" | "revised-resource";

/**
 * What a kind produces, in order. A kind may revise the resource, produce
 * documents alongside it, or both, and execution must match this exactly.
 */
export type TransformationOutputs = readonly [
  TransformationOutput,
  ...TransformationOutput[],
];

/** The barrier a scaffold addresses, which is how a teacher chooses one. */
export type PupilBarrier =
  | "cognitive-flexibility"
  | "gaps-in-knowledge"
  | "inhibitory-control"
  | "language-of-instruction"
  | "processing"
  | "working-memory";

export type TransformationParams = Readonly<Record<string, unknown>>;
export type TransformationParamsSchema = z.ZodType<TransformationParams>;

/** Documents one run produced, in the order the definition declares. */
export type TransformationDocuments = readonly [
  ResourceDocument,
  ...ResourceDocument[],
];

/** How a transformation produces its output. */
export type TransformationExecution =
  | Readonly<{
      apply: (
        document: ResourceDocument,
        context: Readonly<{
          params: TransformationParams;
          supportLevel?: SupportLevel | undefined;
          targetNode?: ResourceNode | undefined;
        }>,
      ) => TransformationDocuments;
      strategy: "deterministic";
    }>
  | Readonly<{
      /** Absent only while a prompt is a draft experiment. */
      contribution?: TransformationContribution;
      prompt: PromptTemplate;
      /** Defaults to `DEFAULT_TRANSFORMATION_ROLE`. */
      role?: TransformationModelRole;
      strategy: "model";
    }>;

/** What a listing knows about the work in progress when it filters kinds. */
export type AppliedTransformationSummary = Readonly<{
  contributionId?: string | undefined;
  kind: string;
  params: TransformationParams;
  targetBlockId?: string | undefined;
}>;

export type TransformationAvailabilityContext = Readonly<{
  /** Successfully applied work, oldest first. */
  appliedTransformations: readonly AppliedTransformationSummary[];
  capabilityId: string;
  /** The adaptation head: the document a new transformation would read. */
  document: ResourceDocument;
  /** Set when listing the kinds offered against one node. */
  targetBlockId?: string | undefined;
}>;

export type TransformationDefinition<
  TKind extends string = string,
  TParamsSchema extends TransformationParamsSchema = TransformationParamsSchema,
  TTarget extends TransformationTarget = TransformationTarget,
  TExecution extends TransformationExecution = TransformationExecution,
> = Readonly<{
  /** Absent for a transformation that addresses no particular barrier. */
  barriers?: readonly PupilBarrier[];
  execution: TExecution;
  isAvailable: (context: TransformationAvailabilityContext) => boolean;
  /** Keys `transformations.kind` and `suggested_transformations.kind`. */
  kind: TKind;
  /** Teacher-facing. */
  label: string;
  /** Oak lesson material this definition selectively consumes. */
  materialRequirements?: readonly TransformationMaterialRequirement[];
  outputs: TransformationOutputs;
  /** Validates `transformations.params`. Derived by `defineTransformation`. */
  params: TParamsSchema;
  /** Drafts are visible to development tooling but never offered to teachers. */
  status: TransformationStatus;
  /** Weakest first; absent when support level does not apply. */
  supportLevels?: SupportLevelOptions;
  target: TTarget;
}>;

/** A requirement as a listing sees it, including whether it can be met yet. */
export type TransformationMaterialSummary = Readonly<{
  available: boolean;
  key: string;
  label: string;
  required: boolean;
  unavailableBecause?: string | undefined;
}>;

/** A serialisable projection used by product listings and development tooling. */
export type TransformationCatalogueItem = Readonly<{
  barriers?: readonly PupilBarrier[] | undefined;
  execution: "deterministic" | "structured-model" | "text-model";
  kind: string;
  label: string;
  materialRequirements: readonly TransformationMaterialSummary[];
  outputs: TransformationOutputs;
  status: TransformationStatus;
  supportLevels?: SupportLevelOptions | undefined;
  target: TransformationTarget;
}>;

export type AvailableTransformation = Omit<
  TransformationCatalogueItem,
  "execution" | "materialRequirements" | "status"
>;
