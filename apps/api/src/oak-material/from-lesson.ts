import type {
  LessonIdentity,
  LessonRepository,
} from "@oaknational/resource-adapter-curriculum";

import type {
  OakMaterial,
  OakMaterialDerivationDependencies,
  OakMaterialRequirement,
  OakMaterialOmissions,
} from "./material";
import { readOakMaterial } from "./requirements";

/** Fetches one lesson and reads whichever parts of it a transformation declared. */
export async function resolveLessonMaterial(
  identity: LessonIdentity,
  lessons: LessonRepository,
  requirements: readonly OakMaterialRequirement[],
  derivationDependencies: OakMaterialDerivationDependencies = {},
): Promise<Readonly<{ material: OakMaterial; omissions: OakMaterialOmissions }>> {
  if (requirements.length === 0) {
    return { material: {}, omissions: {} };
  }

  return readOakMaterial(
    requirements,
    await lessons.fetch(identity),
    derivationDependencies,
  );
}
