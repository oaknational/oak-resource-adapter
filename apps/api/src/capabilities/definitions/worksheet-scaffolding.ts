import { isAdaptable, type CapabilityDefinition } from "../types";

export const worksheetScaffoldingCapability = {
  id: "worksheetScaffolding",
  label: "Add extra scaffolding",
  resourceType: "worksheet",
  isEligible: (context) => isAdaptable(context, "worksheet"),
  suggestionFlowId: "worksheet-scaffolding",
  transformationKinds: [
    "scaffold-add-word-bank",
    "scaffold-add-glossary-bilingual",
    "scaffold-add-knowledge-summary",
    "scaffold-add-modelled-example",
    "scaffold-add-prompt-questions",
    "scaffold-add-prompt-reminders",
    "scaffold-add-structure-frame",
    "scaffold-add-success-criteria",
    "scaffold-chunk-tasks",
    "scaffold-simplify-instructions",
  ],
} as const satisfies CapabilityDefinition;
