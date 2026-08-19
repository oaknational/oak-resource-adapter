import { z } from "zod";

import {
  supportLevelsOf,
  type SupportLevel,
  type SupportLevelOptions,
} from "./support-level";
import type { TransformationMaterialRequirement } from "./oak-material/material";
import type {
  PupilBarrier,
  TransformationAvailabilityContext,
  TransformationDefinition,
  TransformationExecution,
  TransformationOutputs,
  TransformationParams,
  TransformationStatus,
  TransformationTarget,
} from "./types";

type ParamsObject = z.ZodObject;

export type TransformationDeclaration = Readonly<{
  barriers?: readonly PupilBarrier[];
  execution: TransformationExecution;
  isAvailable: (context: TransformationAvailabilityContext) => boolean;
  kind: string;
  label: string;
  materialRequirements?: readonly TransformationMaterialRequirement[];
  outputs: TransformationOutputs;
  /** Arguments beyond the support level, which is derived. */
  params?: ParamsObject;
  status: TransformationStatus;
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
    declaration.status === "active" &&
    declaration.execution.strategy === "model" &&
    declaration.execution.contribution === undefined
  ) {
    throw new Error(
      `Active transformation ${declaration.kind} needs a structured contribution.`,
    );
  }

  const levels = declaration.supportLevels;
  if (levels === undefined) {
    return;
  }

  const declaredLevels: readonly SupportLevel[] = supportLevelsOf(levels);
  if (new Set(declaredLevels).size !== declaredLevels.length) {
    throw new Error(`${declaration.kind} declares a support level more than once.`);
  }
}

/** Derives the params schema while retaining each declaration's literal types. */
export function defineTransformation<
  const TDeclaration extends TransformationDeclaration,
>(declaration: TDeclaration): DefinedTransformation<TDeclaration> {
  validateDeclaration(declaration);

  return { ...declaration, params: paramsSchema(declaration) };
}
