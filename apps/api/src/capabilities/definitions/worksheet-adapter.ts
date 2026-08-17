import { isAdaptable, type CapabilityDefinition } from "../types";

export const worksheetAdapterCapability = {
  id: "worksheetAdapter",
  label: "Scaffolded Practice Sheet",
  resourceType: "worksheet",
  isEligible: (context) => isAdaptable(context, "worksheet"),
} as const satisfies CapabilityDefinition;
