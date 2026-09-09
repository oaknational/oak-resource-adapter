import { renderPromptTemplate } from "@oaknational/resource-adapter-ai";

import { createDevModelInvoker } from "../ai/dev-invoker";
import { capabilityDefinitions } from "../capabilities/registry";
import { listOakMaterial } from "../oak-material/catalogue";
import { resolveApplicationMaterial } from "./application-material-resolver";
import {
  executeRegisteredTransformation,
  previewRegisteredTransformation,
  type RegisteredTransformationCommand,
} from "./application-service";
import type { PreparePrompt } from "./execute";
import { listRegisteredTransformations } from "./service";

const prepareWithoutPersistence: PreparePrompt = ({ template, variables }) =>
  Promise.resolve({
    promptTemplateId: `dev-${template.hash}`,
    text: renderPromptTemplate(template, variables),
  });

export function getDevTransformationCatalogue() {
  return {
    capabilities: Object.values(capabilityDefinitions).map(
      ({ id, label, resourceType, suggestionFlowId, transformationKinds }) => ({
        id,
        label,
        resourceType,
        suggestionFlowId,
        transformationKinds,
      }),
    ),
    material: listOakMaterial(),
    transformations: listRegisteredTransformations(),
  };
}

export function previewDevTransformation(command: RegisteredTransformationCommand) {
  return previewRegisteredTransformation(command, {
    createInvoker: createDevModelInvoker,
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
