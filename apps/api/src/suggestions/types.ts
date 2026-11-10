import type { PromptTemplate } from "@oaknational/resource-adapter-ai";
import type { TransformationInput } from "@oaknational/resource-adapter-contracts/internal";
import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

import type { SuggestionModelRole } from "../ai/model-roles";
import type { OakMaterial, OakMaterialRequirement } from "../oak-material/material";
import type { LessonIdentityContext } from "../rules/context";
import type { RegisteredTransformationKind } from "../transformations/registry";

export type SuggestionFlowDefinition = Readonly<{
  capabilityId: string;
  id: string;
  materialRequirements: readonly OakMaterialRequirement[];
  maxSuggestions: number;
  prompt: PromptTemplate;
  role: SuggestionModelRole;
  transformationKinds: readonly RegisteredTransformationKind[];
}>;

export type TransformationSuggestion = Readonly<{
  inputs: readonly TransformationInput[];
  kind: RegisteredTransformationKind;
  label: string;
  params: Readonly<Record<string, unknown>>;
  reason: string;
  targetBlockId: string | null;
}>;

export type SuggestionLessonContext = Readonly<{
  identity: LessonIdentityContext["lesson"];
  material: OakMaterial;
  facts: LessonEligibilityFacts | null;
}>;
