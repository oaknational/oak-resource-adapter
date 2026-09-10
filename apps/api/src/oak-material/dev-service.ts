import {
  createOakLessonRepository,
  oakCurriculumConfigFromEnv,
  type LessonIdentity,
} from "@oaknational/resource-adapter-curriculum";

import { createDevModelInvoker } from "../ai/dev-invoker";
import { OAK_MATERIAL } from "./catalogue";
import {
  OAK_MATERIAL_KEYS,
  type OakMaterialKey,
  type OakMaterialRequirement,
} from "./material";
import { readOakMaterial } from "./requirements";
import {
  createTranscriptSummariser,
  summariseTranscriptOnce,
} from "./transcript-summary";

export type DevOakMaterialPart = Readonly<{
  key: OakMaterialKey;
  label: string;
  text: string | null;
  warning: string | null;
}>;

const DEV_REQUIREMENTS: readonly OakMaterialRequirement[] = OAK_MATERIAL_KEYS.map(
  (key) => ({ key, required: false }),
);

export async function getDevLessonMaterial(
  identity: LessonIdentity,
): Promise<Readonly<{ parts: readonly DevOakMaterialPart[] }>> {
  const lessons = createOakLessonRepository(oakCurriculumConfigFromEnv(process.env));
  const lesson = await lessons.fetch(identity);
  const { material, omissions } = await readOakMaterial(DEV_REQUIREMENTS, lesson, {
    summariseTranscript: summariseTranscriptOnce((transcript) =>
      createTranscriptSummariser(createDevModelInvoker())(transcript),
    ),
  });

  const parts = DEV_REQUIREMENTS.map(({ key }) => {
    const value = material[key];
    const omission = omissions[key];

    return {
      key,
      label: OAK_MATERIAL[key].label,
      text: value === undefined ? null : OAK_MATERIAL[key].render(value),
      warning: omission ?? null,
    };
  });

  return { parts };
}
