import type { z } from "zod";

import type { JobJsonValue } from "./domain";
import { testEchoJob } from "./test-echo/definition";
import { applySuggestionJob } from "./suggestions/apply-definition";
import { generateSuggestionsJob } from "./suggestions/generate-definition";
import { removeTransformationJob } from "./transformations/remove-definition";
import { retryTransformationJob } from "./transformations/retry-definition";
import { dismissTransformationsJob } from "./transformations/dismiss-definition";

export const jobDefinitions = {
  [applySuggestionJob.kind]: applySuggestionJob,
  [generateSuggestionsJob.kind]: generateSuggestionsJob,
  [removeTransformationJob.kind]: removeTransformationJob,
  [retryTransformationJob.kind]: retryTransformationJob,
  [dismissTransformationsJob.kind]: dismissTransformationsJob,
  [testEchoJob.kind]: testEchoJob,
} as const;

export type RegisteredJobKind = keyof typeof jobDefinitions;

export type RegisteredJobRequest = {
  [TKind in RegisteredJobKind]: {
    kind: TKind;
    input: z.infer<(typeof jobDefinitions)[TKind]["input"]>;
  };
}[RegisteredJobKind];

export function isRegisteredJobKind(kind: string): kind is RegisteredJobKind {
  return Object.hasOwn(jobDefinitions, kind);
}

export function parseJobInput(kind: RegisteredJobKind, input: unknown): JobJsonValue {
  return jobDefinitions[kind].input.parse(input);
}
