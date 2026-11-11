import { z } from "zod";
import type { TransformationInput } from "@oaknational/resource-adapter-contracts/internal";

import {
  supportLevelsOf,
  type SupportLevel,
  type SupportLevelOptions,
} from "./support-level";
import type { OakMaterialRequirement } from "../oak-material/material";
import type {
  PupilBarrier,
  TransformationDefinition,
  TransformationExecution,
  TransformationOutputs,
  TransformationParams,
  TransformationRule,
  TransformationStatus,
  TransformationSuggestionGuidance,
  TransformationTarget,
} from "./types";

type ParamsObject = z.ZodObject;

export type TransformationDeclaration = Readonly<{
  barriers?: readonly PupilBarrier[];
  execution: TransformationExecution;
  kind: string;
  label: string;
  materialRequirements?: readonly OakMaterialRequirement[];
  outputs: TransformationOutputs;
  /** Arguments beyond the support level, which is derived. */
  params?: ParamsObject;
  rules: readonly TransformationRule[];
  status: TransformationStatus;
  suggestion: TransformationSuggestionGuidance;
  supportLevels?: SupportLevelOptions;
  target: TransformationTarget;
}>;

type DeclaredParams<TDeclaration extends TransformationDeclaration> =
  TDeclaration extends { params: infer TParams extends ParamsObject }
    ? z.output<TParams>
    : Record<never, never>;

type DeclaredSupport<TDeclaration extends TransformationDeclaration> =
  TDeclaration extends { supportLevels: infer TLevels extends SupportLevelOptions }
    ? { supportLevel: TLevels[number]["level"] }
    : Record<never, never>;

type DerivedParams<TDeclaration extends TransformationDeclaration> = Readonly<
  DeclaredParams<TDeclaration> & DeclaredSupport<TDeclaration>
> &
  TransformationParams;

export type DefinedTransformation<TDeclaration extends TransformationDeclaration> =
  TransformationDefinition<
    TDeclaration["kind"],
    z.ZodType<DerivedParams<TDeclaration>>,
    TDeclaration["target"],
    TDeclaration["execution"]
  >;

export const SUPPORT_LEVEL_INPUT_ID = "supportLevel";

export function supportLevelInput(
  supportLevels: SupportLevelOptions,
): TransformationInput {
  return {
    id: SUPPORT_LEVEL_INPUT_ID,
    kind: "choice",
    label: "Support level",
    options: supportLevels.map(({ description, label, level }) => ({
      description,
      label,
      value: level,
    })),
  };
}

function paramsSchema<TDeclaration extends TransformationDeclaration>(
  declaration: TDeclaration,
): z.ZodType<DerivedParams<TDeclaration>> {
  const declared = declaration.params ?? z.strictObject({});
  const levels = declaration.supportLevels;
  const schema =
    levels === undefined
      ? declared
      : declared.extend({ supportLevel: z.enum(supportLevelsOf(levels)) });

  // Zod erases which keys came from the declaration, and
  // `strictObject({})` widens to `Record<string, never>`,
  // so no assertion narrower than `unknown` is accepted here.
  return schema as unknown as z.ZodType<DerivedParams<TDeclaration>>;
}

function validateDeclaration(declaration: TransformationDeclaration): void {
  if (
    declaration.status !== "draft" &&
    declaration.execution.strategy === "model" &&
    declaration.execution.contribution === undefined
  ) {
    throw new Error(
      `Model transformation ${declaration.kind} needs a structured contribution unless it is a draft.`,
    );
  }

  if (
    "offer" in declaration.suggestion &&
    (declaration.params !== undefined || declaration.supportLevels !== undefined)
  ) {
    throw new Error(
      `${declaration.kind} is always offered, so nothing would choose its params.`,
    );
  }

  const levels = declaration.supportLevels;
  const declaredLevels: readonly SupportLevel[] =
    levels === undefined ? [] : supportLevelsOf(levels);
  if (new Set(declaredLevels).size !== declaredLevels.length) {
    throw new Error(`${declaration.kind} declares a support level more than once.`);
  }

  for (const { id, removesSupportLevels = [] } of declaration.rules) {
    if (removesSupportLevels.some((level) => !declaredLevels.includes(level))) {
      throw new Error(
        `${declaration.kind}'s ${id} rule removes a level it does not declare.`,
      );
    }
  }
}

/** Derives the params schema while retaining each declaration's literal types. */
export function defineTransformation<
  const TDeclaration extends TransformationDeclaration,
>(declaration: TDeclaration): DefinedTransformation<TDeclaration> {
  validateDeclaration(declaration);

  return {
    ...declaration,
    ...(declaration.supportLevels === undefined
      ? {}
      : { inputs: [supportLevelInput(declaration.supportLevels)] }),
    params: paramsSchema(declaration),
  };
}
