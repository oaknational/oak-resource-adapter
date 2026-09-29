import type { ResourceDocument } from "@oaknational/resource-document";

import type { OakMaterial, OakMaterialRequirement } from "../../oak-material/material";
import { renderOakMaterial } from "../../oak-material/requirements";
import { describeCohort } from "../../transformations/prompt-parts/language.part";

export function suggestionLessonPart(
  document: ResourceDocument,
  requirements: readonly OakMaterialRequirement[],
  material: OakMaterial,
): string {
  const { metadata } = document;
  const subject = "subject" in metadata ? metadata.subject?.label : undefined;
  const cohort =
    "keyStage" in metadata
      ? describeCohort({ keyStage: metadata.keyStage, yearGroup: metadata.yearGroup })
      : undefined;

  return [
    ...(subject === undefined ? [] : [`Subject: ${subject}`]),
    `Pupils: ${cohort ?? "the resource does not say which year group."}`,
    "",
    renderOakMaterial(requirements, material),
  ].join("\n");
}
