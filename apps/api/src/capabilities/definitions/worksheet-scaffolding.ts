import { isAdaptable, type CapabilityDefinition } from "../types";

export const worksheetScaffoldingCapability = {
  id: "worksheetScaffolding",
  label: "Add extra scaffolding",
  resourceType: "worksheet",
  isEligible: (context) => isAdaptable(context, "worksheet"),
  suggestionFlowId: "worksheet-scaffolding",
  transformationKinds: [
    "scaffold-add-word-bank",
    "scaffold-add-task-vocabulary",
    "scaffold-add-prompt-questions",
    "scaffold-add-sentence-starters",
    "scaffold-add-sentence-frames",
    "scaffold-chunk-tasks",
  ],
} as const satisfies CapabilityDefinition;
