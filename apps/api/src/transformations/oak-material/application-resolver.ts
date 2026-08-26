import {
  createOakLessonRepository,
  oakCurriculumConfigFromEnv,
} from "@oaknational/resource-adapter-curriculum";

import type { ResolveTransformationMaterial } from "../application-service";
import { TransformationDependencyError } from "../errors";
import { OAK_MATERIAL, oakMaterialIsAvailable } from "./catalogue";
import { resolveLessonMaterial } from "./from-lesson";

export const resolveApplicationMaterial: ResolveTransformationMaterial = async (
  requirements,
  lesson,
) => {
  if (requirements.length === 0) {
    return { material: {}, warnings: [] };
  }

  const resolvable = requirements.filter(({ key }) => oakMaterialIsAvailable(key));

  const unavailable = requirements
    .filter(({ key }) => !oakMaterialIsAvailable(key))
    .map(({ key }) => {
      const part = OAK_MATERIAL[key];
      return `${part.label} is not available: ${part.unavailableBecause ?? "no source exists yet."}`;
    });

  if (resolvable.length === 0 || lesson === undefined) {
    return {
      material: {},
      warnings: [
        ...unavailable,
        ...(resolvable.length > 0 && lesson === undefined
          ? ["No lesson was supplied, so its material is absent."]
          : []),
      ],
    };
  }

  try {
    const repository = createOakLessonRepository(
      oakCurriculumConfigFromEnv(process.env),
    );
    const resolution = await resolveLessonMaterial(lesson, repository, resolvable);
    return {
      material: resolution.material,
      warnings: [...unavailable, ...resolution.warnings],
    };
  } catch (cause) {
    if (resolvable.some(({ required }) => required)) {
      throw new TransformationDependencyError(
        "Required Oak lesson material could not be resolved.",
        { cause },
      );
    }
    return {
      material: {},
      warnings: [
        ...unavailable,
        "Oak lesson material could not be resolved; the run will omit it.",
      ],
    };
  }
};
