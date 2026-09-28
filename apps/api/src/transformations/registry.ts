import { identityTransformation } from "./definitions/identity";
import { addPromptQuestionsTransformation } from "./definitions/scaffold-add-prompt-questions";
import { addSentenceFramesTransformation } from "./definitions/scaffold-add-sentence-frames";
import { addSentenceStartersTransformation } from "./definitions/scaffold-add-sentence-starters";
import { addTaskVocabularyTransformation } from "./definitions/scaffold-add-task-vocabulary";
import { addWordBankTransformation } from "./definitions/scaffold-add-word-bank";
import { chunkTasksTransformation } from "./definitions/scaffold-chunk-tasks";

/**
 * Add new transformation definitions to this map. A capability chooses from it;
 * being registered does not expose a kind to teachers. Retired kinds stay here
 * so that rows already storing their kind still resolve.
 */
export const transformationDefinitions = {
  [identityTransformation.kind]: identityTransformation,
  [addWordBankTransformation.kind]: addWordBankTransformation,
  [addTaskVocabularyTransformation.kind]: addTaskVocabularyTransformation,
  [addPromptQuestionsTransformation.kind]: addPromptQuestionsTransformation,
  [addSentenceStartersTransformation.kind]: addSentenceStartersTransformation,
  [addSentenceFramesTransformation.kind]: addSentenceFramesTransformation,
  [chunkTasksTransformation.kind]: chunkTasksTransformation,
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
