import { OAK_MATERIAL } from "../oak-material/catalogue";
import { TransformationRequestError } from "./errors";
import type { OakMaterial, OakMaterialRequirement } from "../oak-material/material";

export function assertRequiredMaterial(
  kind: string,
  requirements: readonly OakMaterialRequirement[],
  material: OakMaterial,
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
