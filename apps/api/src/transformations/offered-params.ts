import type { TransformationInput } from "@oaknational/resource-adapter-contracts/internal";
import { z } from "zod";

import type { TransformationDefinition, TransformationParamsSchema } from "./types";

/**
 * The definition's params, with each choice limited to options that were offered
 * and that the definition still declares, so a stored offer can only narrow them.
 */
export function offeredParamsSchema(
  definition: TransformationDefinition,
  inputs: readonly TransformationInput[] | undefined,
): TransformationParamsSchema {
  if (inputs === undefined || inputs.length === 0) {
    return definition.params;
  }
  if (!(definition.params instanceof z.ZodObject)) {
    throw new TypeError(`${definition.kind} offers choices but has no params object.`);
  }
  const declared = new Map(
    (definition.inputs ?? []).map(({ id, options }) => [
      id,
      options.map(({ value }) => value),
    ]),
  );
  return definition.params.extend(
    Object.fromEntries(
      inputs.map(({ id, options }) => [
        id,
        z.enum(
          options
            .map(({ value }) => value)
            .filter((value) => declared.get(id)?.includes(value)),
        ),
      ]),
    ),
  ) as unknown as TransformationParamsSchema;
}
