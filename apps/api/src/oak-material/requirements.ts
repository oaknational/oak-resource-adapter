import type { Lesson } from "@oaknational/resource-adapter-curriculum";
import { raLogger } from "@oaknational/resource-adapter-logger";

import {
  OAK_MATERIAL,
  oakMaterialIsAvailable,
  oakMaterialPromptHeading,
} from "./catalogue";
import type {
  OakMaterialDerivationDependencies,
  OakMaterialValue,
  OakMaterial,
  OakMaterialKey,
  OakMaterialRequirement,
  OakMaterialDerivation,
  OakMaterialOmissions,
} from "./material";

const log = raLogger("capabilities");

/**
 * Reads the part, falling back to building it. A part Oak has to build can fail
 * on its own; the run continues without it rather than losing the parts that
 * did resolve.
 */
async function resolveOakMaterial(
  key: OakMaterialKey,
  lesson: Lesson,
  derivationDependencies: OakMaterialDerivationDependencies,
): Promise<OakMaterialDerivation | undefined> {
  const part = OAK_MATERIAL[key];
  const read = part.read === null ? undefined : part.read(lesson);

  if (read !== undefined) {
    return { value: read };
  }

  if (part.derive === undefined) {
    return undefined;
  }

  try {
    return await part.derive(lesson, derivationDependencies);
  } catch (error) {
    log.error(error, { report: true });
    return { failedBecause: "it raised an error" };
  }
}

/** What a listing tells the caller about a part that did not resolve. */
function explainOakMaterialOmission(
  key: OakMaterialKey,
  failedBecause: string | undefined,
): string {
  const part = OAK_MATERIAL[key];

  if (!oakMaterialIsAvailable(key)) {
    return `${part.label} is not available: ${part.unavailableBecause ?? "no source exists yet."}`;
  }

  return failedBecause === undefined
    ? `${part.label} is absent from this lesson, so the run will omit it.`
    : `${part.label} could not be built because ${failedBecause}, so the run will omit it.`;
}

/** Reads every requested part from one fetched lesson. */
export async function readOakMaterial(
  requirements: readonly OakMaterialRequirement[],
  lesson: Lesson,
  derivationDependencies: OakMaterialDerivationDependencies = {},
): Promise<Readonly<{ material: OakMaterial; omissions: OakMaterialOmissions }>> {
  const material: Partial<Record<OakMaterialKey, OakMaterialValue>> = {};
  const omissions: Partial<Record<OakMaterialKey, string>> = {};

  for (const { key, required } of requirements) {
    const resolution = await resolveOakMaterial(key, lesson, derivationDependencies);

    if (resolution?.value !== undefined) {
      material[key] = resolution.value;
      continue;
    }

    if (!required) {
      omissions[key] = explainOakMaterialOmission(key, resolution?.failedBecause);
    }
  }

  return { material, omissions };
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
    .filter(({ key }) => oakMaterialIsAvailable(key))
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
