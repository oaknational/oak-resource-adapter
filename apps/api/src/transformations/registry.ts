import { identityTransformation } from "./definitions/identity";
import { addGlossaryBilingualTransformation } from "./definitions/scaffold-add-glossary-bilingual";
import { addGlossaryQuestionTransformation } from "./definitions/scaffold-add-glossary-question";
import { addKnowledgeSummaryTransformation } from "./definitions/scaffold-add-knowledge-summary";
import { addModelledExampleTransformation } from "./definitions/scaffold-add-modelled-example";
import { addPromptQuestionsTransformation } from "./definitions/scaffold-add-prompt-questions";
import { addPromptRemindersTransformation } from "./definitions/scaffold-add-prompt-reminders";
import { addStructureFrameTransformation } from "./definitions/scaffold-add-structure-frame";
import { addSuccessCriteriaTransformation } from "./definitions/scaffold-add-success-criteria";
import { addWordBankTransformation } from "./definitions/scaffold-add-word-bank";
import { chunkTasksTransformation } from "./definitions/scaffold-chunk-tasks";
import { simplifyInstructionsTransformation } from "./definitions/scaffold-simplify-instructions";

/**
 * Add new transformation definitions to this map. A capability chooses from it;
 * being registered does not expose a kind to teachers.
 */
export const transformationDefinitions = {
  [identityTransformation.kind]: identityTransformation,
  [addWordBankTransformation.kind]: addWordBankTransformation,
  [addGlossaryQuestionTransformation.kind]: addGlossaryQuestionTransformation,
  [addGlossaryBilingualTransformation.kind]: addGlossaryBilingualTransformation,
  [simplifyInstructionsTransformation.kind]: simplifyInstructionsTransformation,
  [addKnowledgeSummaryTransformation.kind]: addKnowledgeSummaryTransformation,
  [addPromptQuestionsTransformation.kind]: addPromptQuestionsTransformation,
  [addPromptRemindersTransformation.kind]: addPromptRemindersTransformation,
  [chunkTasksTransformation.kind]: chunkTasksTransformation,
  [addStructureFrameTransformation.kind]: addStructureFrameTransformation,
  [addModelledExampleTransformation.kind]: addModelledExampleTransformation,
  [addSuccessCriteriaTransformation.kind]: addSuccessCriteriaTransformation,
} as const;

export type RegisteredTransformationKind = keyof typeof transformationDefinitions;

export type RegisteredTransformationRequest = {
  [TKind in RegisteredTransformationKind]: Readonly<{
    kind: TKind;
    params: import("zod").z.input<(typeof transformationDefinitions)[TKind]["params"]>;
    targetBlockId?: string | undefined;
  }>;
}[RegisteredTransformationKind];

export function isRegisteredTransformationKind(
  kind: string,
): kind is RegisteredTransformationKind {
  return Object.hasOwn(transformationDefinitions, kind);
}

export function parseTransformationParams<TKind extends RegisteredTransformationKind>(
  kind: TKind,
  params: unknown,
): import("zod").z.output<(typeof transformationDefinitions)[TKind]["params"]> {
  return transformationDefinitions[kind].params.parse(params) as import("zod").z.output<
    (typeof transformationDefinitions)[TKind]["params"]
  >;
}
