import type { z } from "zod";

import type {
  ModelIncompleteReason,
  ModelResponseOutput,
  ModelUsage,
} from "./protocol.js";

/** The transport owns conversion from Zod to its provider's schema dialect. */
export type ModelOutputRequirement =
  | Readonly<{ kind: "PROVIDER_DEFAULT" }>
  | Readonly<{ kind: "TEXT" }>
  | Readonly<{
      kind: "STRUCTURED";
      name: string;
      schema: z.ZodType;
    }>;

export type ModelInvocationMeta = Readonly<{
  invocationId: string;
  providerResponseId?: string;
  usage?: ModelUsage;
}>;

export type ModelOutputFailure =
  | Readonly<{ outcome: "INCOMPLETE"; reason: ModelIncompleteReason }>
  | Readonly<{ outcome: "OUTPUT_MISSING" }>
  | Readonly<{ outcome: "REFUSAL"; refusal: string }>;

export type StructuredOutputIssue = z.core.$ZodIssue;

export type StructuredModelOutputFailure =
  | Readonly<{
      outcome: "STRUCTURED_OUTPUT_FAILURE";
      reason: "INVALID_JSON";
    }>
  | Readonly<{
      issues: readonly StructuredOutputIssue[];
      outcome: "STRUCTURED_OUTPUT_FAILURE";
      reason: "SCHEMA_MISMATCH";
    }>;

export type StructuredOutputFailureReason = StructuredModelOutputFailure["reason"];

export type OutputValidationStatus = "VALID" | StructuredOutputFailureReason;

export type TextModelOutcome =
  ModelOutputFailure | Readonly<{ outcome: "SUCCESS"; output: string }>;

export type StructuredModelOutcome<TOutput> =
  | ModelOutputFailure
  | StructuredModelOutputFailure
  | Readonly<{ outcome: "SUCCESS"; output: TOutput }>;

export type TextModelOutputResult = TextModelOutcome &
  Readonly<{ meta: ModelInvocationMeta }>;

export type StructuredModelOutputResult<TOutput> = StructuredModelOutcome<TOutput> &
  Readonly<{ meta: ModelInvocationMeta }>;

export function outputFailure(
  output: Exclude<ModelResponseOutput, { kind: "TEXT" }>,
): ModelOutputFailure {
  switch (output.kind) {
    case "INCOMPLETE":
      return { outcome: "INCOMPLETE", reason: output.reason };
    case "MISSING":
      return { outcome: "OUTPUT_MISSING" };
    case "REFUSAL":
      return { outcome: "REFUSAL", refusal: output.refusal };
  }
}
