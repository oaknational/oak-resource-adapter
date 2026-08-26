import type { PromptTemplate } from "@oaknational/resource-adapter-ai";

import type { SuggestionModelRole } from "../ai/model-roles";
import type { RegisteredTransformationKind } from "../transformations/registry";

export type SuggestionFlowDefinition = Readonly<{
  capabilityId: string;
  id: string;
  maxSuggestions: number;
  prompt: PromptTemplate;
  role: SuggestionModelRole;
  transformationKinds: readonly RegisteredTransformationKind[];
}>;

export type TransformationSuggestion = Readonly<{
  kind: RegisteredTransformationKind;
  label: string;
  params: Readonly<Record<string, unknown>>;
  reason: string;
  targetBlockId: string | null;
}>;
