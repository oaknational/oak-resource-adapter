import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import type { FeatureFlagKey } from "./catalogue";

/** API-local interface implemented by each feature-flag provider. */
export type FeatureFlagServiceType = Readonly<{
  isEnabled: (
    flag: FeatureFlagKey,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<boolean> | boolean;
  getEnabledFlags: (
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<readonly FeatureFlagKey[]> | readonly FeatureFlagKey[];
}>;
