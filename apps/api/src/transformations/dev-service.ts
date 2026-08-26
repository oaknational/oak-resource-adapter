import { renderPromptTemplate } from "@oaknational/resource-adapter-ai";

import { createDevModelInvoker } from "../ai/dev-invoker";
import {
  executeRegisteredTransformation,
  previewRegisteredTransformation,
  type RegisteredTransformationCommand,
} from "./application-service";
import type { PreparePrompt } from "./execute";
import { resolveApplicationMaterial } from "./oak-material/application-resolver";
import { listOakMaterial } from "./oak-material/catalogue";
import { listRegisteredTransformations } from "./service";

const prepareWithoutPersistence: PreparePrompt = ({ template, variables }) =>
  Promise.resolve({
    promptTemplateId: `dev-${template.hash}`,
    text: renderPromptTemplate(template, variables),
  });

export function getDevTransformationCatalogue() {
  return {
    material: listOakMaterial(),
    transformations: listRegisteredTransformations(),
  };
}

export function previewDevTransformation(command: RegisteredTransformationCommand) {
  return previewRegisteredTransformation(command, {
    prepare: prepareWithoutPersistence,
    resolveMaterial: resolveApplicationMaterial,
  });
}

export function runDevTransformation(command: RegisteredTransformationCommand) {
  return executeRegisteredTransformation(command, {
    createInvoker: createDevModelInvoker,
    prepare: prepareWithoutPersistence,
    resolveMaterial: resolveApplicationMaterial,
  });
}
