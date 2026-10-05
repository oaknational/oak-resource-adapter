import { z } from "zod";

import { adapterProxyPath, readApiResponse } from "../../harness-api";
import type { LessonScenario } from "../../scenario-types";

const partSchema = z.strictObject({
  key: z.string(),
  label: z.string(),
  text: z.string().nullable(),
  warning: z.string().nullable(),
});

export type OakMaterialPart = z.infer<typeof partSchema>;

const responseSchema = z.strictObject({ parts: z.array(partSchema) });

export async function fetchOakMaterial(
  lesson: LessonScenario["lesson"],
  signal: AbortSignal,
): Promise<readonly OakMaterialPart[]> {
  const response = await fetch(`${adapterProxyPath}/dev/oak-material`, {
    body: JSON.stringify({
      lesson: {
        lessonSlug: lesson.lessonSlug,
        programmeSlug: lesson.programmeSlug,
      },
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  });

  const { parts } = await readApiResponse(response, responseSchema, "Oak material");
  return parts;
}
