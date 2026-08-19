import type {
  LessonIdentity,
  LessonRepository,
} from "@oaknational/resource-adapter-curriculum";

import type {
  TransformationMaterial,
  TransformationMaterialRequirement,
} from "./material";
import { readOakMaterial } from "./requirements";

/** Fetches one lesson and reads whichever parts of it a transformation declared. */
export async function resolveLessonMaterial(
  identity: LessonIdentity,
  lessons: LessonRepository,
  requirements: readonly TransformationMaterialRequirement[],
): Promise<
  Readonly<{ material: TransformationMaterial; warnings: readonly string[] }>
> {
  if (requirements.length === 0) {
    return { material: {}, warnings: [] };
  }

  return readOakMaterial(requirements, await lessons.fetch(identity));
}
