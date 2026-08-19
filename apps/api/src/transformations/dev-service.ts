import { renderPromptTemplate } from "@oaknational/resource-adapter-ai";
import {
  createOakLessonRepository,
  oakCurriculumConfigFromEnv,
} from "@oaknational/resource-adapter-curriculum";

import { createDevModelInvoker } from "../ai/dev-invoker";
import {
  listOakMaterial,
  OAK_MATERIAL,
  oakMaterialIsAvailable,
} from "./oak-material/catalogue";
import {
  executeRegisteredTransformation,
  previewRegisteredTransformation,
  type RegisteredTransformationCommand,
  type ResolveTransformationMaterial,
} from "./application-service";
import type { PreparePrompt } from "./execute";
import { TransformationDependencyError } from "./errors";
import { resolveLessonMaterial } from "./oak-material/from-lesson";
import { listRegisteredTransformations } from "./service";

const prepareWithoutPersistence: PreparePrompt = ({ template, variables }) =>
  Promise.resolve({
    promptTemplateId: `dev-${template.hash}`,
    text: renderPromptTemplate(template, variables),
  });

const resolveDevMaterial: ResolveTransformationMaterial = async (
  requirements,
  lesson,
) => {
  const resolvable = requirements.filter(({ key }) => oakMaterialIsAvailable(key));

  if (requirements.length === 0) {
    return { material: {}, warnings: [] };
  }

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

export function getDevTransformationCatalogue() {
  return {
    material: listOakMaterial(),
    transformations: listRegisteredTransformations(),
  };
}

export function previewDevTransformation(command: RegisteredTransformationCommand) {
  return previewRegisteredTransformation(command, {
    prepare: prepareWithoutPersistence,
    resolveMaterial: resolveDevMaterial,
  });
}

export function runDevTransformation(command: RegisteredTransformationCommand) {
  return executeRegisteredTransformation(command, {
    createInvoker: createDevModelInvoker,
    prepare: prepareWithoutPersistence,
    resolveMaterial: resolveDevMaterial,
  });
}
