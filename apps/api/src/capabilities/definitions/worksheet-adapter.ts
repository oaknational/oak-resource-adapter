import type { CapabilityDefinition } from "../types";

export const worksheetAdapterCapability = {
  id: "worksheetAdapter",
  label: "Scaffolded Practice Sheet",
  resourceType: "worksheet",
  isEligible: ({ lesson }) => lesson.availableResources.includes("worksheet"),
} as const satisfies CapabilityDefinition;
