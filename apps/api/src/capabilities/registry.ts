import { worksheetAdapterCapability } from "./definitions/worksheet-adapter";

/** Add new capability definitions to this map; the service evaluates every entry. */
export const capabilityDefinitions = {
  [worksheetAdapterCapability.id]: worksheetAdapterCapability,
} as const;
