import type { CapabilityDefinition } from "./definition";

const worksheetAdapterCapability: CapabilityDefinition = {
  id: "worksheetAdapter",
  label: "Scaffolded Practice Sheet",
  resourceType: "worksheet",
  isEligible: ({ lesson }) => lesson.availableResources.includes("worksheet"),
};

/** Add new capability definitions to this list; the service evaluates every entry. */
export const capabilityDefinitions: ReadonlyArray<CapabilityDefinition> = [
  worksheetAdapterCapability,
];
