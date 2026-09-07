import type { CapabilityDefinition } from "./types";
import { worksheetScaffoldingCapability } from "./definitions/worksheet-scaffolding";

/** Add new capability definitions to this map; the service evaluates every entry. */
export const capabilityDefinitions = {
  [worksheetScaffoldingCapability.id]: worksheetScaffoldingCapability,
} as const;

export function requireCapability(capabilityId: string): CapabilityDefinition {
  const capability = Object.hasOwn(capabilityDefinitions, capabilityId)
    ? capabilityDefinitions[capabilityId as keyof typeof capabilityDefinitions]
    : undefined;

  if (capability === undefined) {
    throw new Error(`Unknown capability ${JSON.stringify(capabilityId)}.`);
  }

  return capability;
}
