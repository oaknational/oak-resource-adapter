import { worksheetScaffoldingCapability } from "./definitions/worksheet-scaffolding";

/** Add new capability definitions to this map; the service evaluates every entry. */
export const capabilityDefinitions = {
  [worksheetScaffoldingCapability.id]: worksheetScaffoldingCapability,
} as const;
