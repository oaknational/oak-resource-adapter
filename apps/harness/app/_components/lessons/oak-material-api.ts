import {
  oakMaterialResponseSchema,
  type OakMaterialPart,
  type OakMaterialRequest,
} from "@oaknational/resource-adapter-dev-api-contracts";

import { adapterProxyPath, readApiResponse } from "../../harness-api";
import type { LessonScenario } from "../../scenario-types";

export async function fetchOakMaterial(
  lesson: LessonScenario["lesson"],
  signal: AbortSignal,
): Promise<readonly OakMaterialPart[]> {
  const request: OakMaterialRequest = {
    lesson: {
      lessonSlug: lesson.lessonSlug,
      programmeSlug: lesson.programmeSlug,
    },
  };
  const response = await fetch(`${adapterProxyPath}/dev/oak-material`, {
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  });

  const { parts } = await readApiResponse(
    response,
    oakMaterialResponseSchema,
    "Oak material",
  );
  return parts;
}
