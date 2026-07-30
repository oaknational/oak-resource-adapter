import type { FeatureFlagServiceType } from "@oaknational/resource-adapter-contracts/server";
import { featureFlagCatalogue, type FeatureFlagKey } from "./catalogue";

export function createInMemoryFeatureFlags(
  overrides: Partial<Record<FeatureFlagKey, boolean>> = {},
): FeatureFlagServiceType<FeatureFlagKey> {
  return {
    isEnabled: (flag) => overrides[flag] ?? featureFlagCatalogue[flag].default,
  };
}
