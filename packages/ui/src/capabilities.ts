import type {
  ResourceAdapterCapabilitiesResponse as ServiceCapabilitiesResponse,
  ResourceAdapterCapability as ServiceCapability,
} from "@oaknational/resource-adapter-contracts";

const supportedCapabilityIds = ["worksheetAdapter"] as const;

export type ResourceAdapterCapabilityId = (typeof supportedCapabilityIds)[number];
export type ResourceAdapterCapability = Omit<ServiceCapability, "id"> &
  Readonly<{ id: ResourceAdapterCapabilityId }>;
export type ResourceAdapterCapabilitiesResponse = Readonly<{
  capabilities: readonly ResourceAdapterCapability[];
}>;

function isSupportedCapability(
  capability: ServiceCapability,
): capability is ResourceAdapterCapability {
  return supportedCapabilityIds.some((id) => id === capability.id);
}

/**
 * Older package versions silently ignore capabilities introduced by a newer
 * service. This lets service rollout remain safe while UI support is released
 * separately through OWA's package-update workflow.
 */
export function getSupportedCapabilities(
  response: ServiceCapabilitiesResponse,
): ResourceAdapterCapabilitiesResponse {
  return {
    capabilities: response.capabilities.filter(isSupportedCapability),
  };
}
