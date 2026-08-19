import type { Lesson } from "@oaknational/resource-adapter-curriculum";

import { OAK_MATERIAL, oakMaterialPromptHeading } from "./catalogue";
import { TransformationRequestError } from "../errors";
import type {
  OakMaterialValue,
  TransformationMaterial,
  TransformationMaterialRequirement,
} from "./material";

/** Reads every requested part from one fetched lesson. */
export function readOakMaterial(
  requirements: readonly TransformationMaterialRequirement[],
  lesson: Lesson,
): Readonly<{ material: TransformationMaterial; warnings: readonly string[] }> {
  const material: Record<string, OakMaterialValue> = {};
  const warnings: string[] = [];

  for (const { key, required } of requirements) {
    const part = OAK_MATERIAL[key];
    const value = part.read === null ? undefined : part.read(lesson);

    if (value !== undefined) {
      material[key] = value;
      continue;
    }

    if (!required) {
      warnings.push(
        part.read === null
          ? `${part.label} is not available: ${part.unavailableBecause ?? "no source exists yet."}`
          : `${part.label} is absent from this lesson, so the run will omit it.`,
      );
    }
  }

  return { material, warnings };
}

export function assertRequiredMaterial(
  kind: string,
  requirements: readonly TransformationMaterialRequirement[],
  material: TransformationMaterial,
): void {
  const missing = requirements.filter(
    ({ key, required }) => required && material[key] === undefined,
  );

  if (missing.length === 0) {
    return;
  }

  const reasons = missing.map(({ key }) => {
    const part = OAK_MATERIAL[key];
    return part.read === null
      ? `${key} (${part.unavailableBecause ?? "no source exists yet."})`
      : key;
  });

  throw new TransformationRequestError(
    `${kind} needs lesson material it was not given: ${reasons.join(", ")}.`,
  );
}

/**
 * The `{{lessonMaterial}}` block, in the order the definition declared. A part
 * this lesson happens to lack says so, rather than leaving the model to guess
 * whether it was withheld; a part Oak cannot supply at all is left out, since a
 * transformation may declare what it wants before a source exists.
 */
export function renderOakMaterial(
  requirements: readonly TransformationMaterialRequirement[],
  material: TransformationMaterial,
): string {
  return requirements
    .filter(({ key }) => OAK_MATERIAL[key].read !== null)
    .map(({ key }) => {
      const value = material[key];
      const body =
        value === undefined
          ? "Not available for this resource. Work from the resource alone."
          : OAK_MATERIAL[key].render(value);

      return `${oakMaterialPromptHeading(key)}\n\n${body}`;
    })
    .join("\n\n");
}
