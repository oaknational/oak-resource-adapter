import {
  featureFlagCatalogue,
  type FeatureFlagKey,
  type FeatureFlagServiceType,
} from "@oaknational/resource-adapter-contracts/server";

export function createInMemoryFeatureFlags(
  overrides: Partial<Record<FeatureFlagKey, boolean>> = {},
): FeatureFlagServiceType {
  return {
    isEnabled: (flag) => overrides[flag] ?? featureFlagCatalogue[flag].default,
    getEnabledFlags: () =>
      (Object.keys(featureFlagCatalogue) as FeatureFlagKey[]).filter(
        (flag) => overrides[flag] ?? featureFlagCatalogue[flag].default,
      ),
  };
}
