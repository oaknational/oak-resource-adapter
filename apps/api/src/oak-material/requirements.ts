import type { Lesson } from "@oaknational/resource-adapter-curriculum";

import { OAK_MATERIAL, oakMaterialPromptHeading } from "./catalogue";
import type { OakMaterialValue, OakMaterial, OakMaterialRequirement } from "./material";

/** Reads every requested part from one fetched lesson. */
export function readOakMaterial(
  requirements: readonly OakMaterialRequirement[],
  lesson: Lesson,
): Readonly<{ material: OakMaterial; warnings: readonly string[] }> {
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

/**
 * The `{{lessonMaterial}}` block, in the order the definition declared. A part
 * this lesson happens to lack says so, rather than leaving the model to guess
 * whether it was withheld; a part Oak cannot supply at all is left out, since a
 * transformation may declare what it wants before a source exists.
 */
export function renderOakMaterial(
  requirements: readonly OakMaterialRequirement[],
  material: OakMaterial,
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
