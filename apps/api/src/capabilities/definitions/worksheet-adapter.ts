import { isAdaptable, type CapabilityDefinition } from "../types";

export const worksheetAdapterCapability = {
  id: "worksheetAdapter",
  label: "Scaffolded Practice Sheet",
  resourceType: "worksheet",
  isEligible: (context) => isAdaptable(context, "worksheet"),
  transformations: ["scaffold-add-word-bank", "scaffold-add-glossary-question"],
} as const satisfies CapabilityDefinition;
