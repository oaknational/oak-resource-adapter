import { featureFlagCatalogue, type FeatureFlagKey } from "./catalogue";
import type { FeatureFlagServiceType } from "./service";

export function createInMemoryFeatureFlags(
  overrides: Partial<Record<FeatureFlagKey, boolean>> = {},
): FeatureFlagServiceType {
  return {
    isEnabled: (flag) => overrides[flag] ?? featureFlagCatalogue[flag].default,
  };
}
