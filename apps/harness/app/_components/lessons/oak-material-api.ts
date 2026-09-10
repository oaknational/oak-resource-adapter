import { z } from "zod";

import { adapterProxyPath } from "../../harness-api";
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

  if (!response.ok) {
    const failure = z
      .object({ error: z.string() })
      .safeParse(await response.json().catch(() => null));

    throw new Error(
      failure.success
        ? failure.data.error
        : `The API returned HTTP ${response.status}.`,
    );
  }

  const parsed = responseSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new Error("The API returned Oak material in an unrecognised shape.");
  }

  return parsed.data.parts;
}
