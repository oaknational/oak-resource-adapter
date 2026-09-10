import {
  createOakLessonRepository,
  oakCurriculumConfigFromEnv,
} from "@oaknational/resource-adapter-curriculum";

import type { ResourceAdapterModelInvoker } from "../ai/model-roles";
import { OAK_MATERIAL, oakMaterialIsAvailable } from "../oak-material/catalogue";
import { resolveLessonMaterial } from "../oak-material/from-lesson";
import type {
  OakMaterialDerivationDependencies,
  OakMaterialRequirement,
} from "../oak-material/material";
import {
  createTranscriptSummariser,
  summariseTranscriptOnce,
} from "../oak-material/transcript-summary";
import type { ResolveTransformationMaterial } from "./application-service";
import { TransformationDependencyError } from "./errors";

function createDerivationDependencies(
  requirements: readonly OakMaterialRequirement[],
  createInvoker: (() => ResourceAdapterModelInvoker) | undefined,
): OakMaterialDerivationDependencies {
  const needsTranscriptSummariser = requirements.some(({ key }) =>
    key.startsWith("lesson.transcriptSummary"),
  );

  if (createInvoker === undefined || !needsTranscriptSummariser) {
    return {};
  }

  return {
    summariseTranscript: summariseTranscriptOnce(
      createTranscriptSummariser(createInvoker()),
    ),
  };
}

export const resolveApplicationMaterial: ResolveTransformationMaterial = async (
  requirements,
  lesson,
  createInvoker,
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
    const derivationDependencies = createDerivationDependencies(
      resolvable,
      createInvoker,
    );
    const resolution = await resolveLessonMaterial(
      lesson,
      repository,
      resolvable,
      derivationDependencies,
    );
    return {
      material: resolution.material,
      warnings: [...unavailable, ...Object.values(resolution.omissions)],
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
