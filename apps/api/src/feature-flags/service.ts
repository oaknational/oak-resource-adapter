import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import type { FeatureFlagKey } from "./catalogue";

import { createInMemoryFeatureFlags } from "./in-memory";
import { PostHogFeatureFlagAdapter } from "./posthogAdapter";

/**
 * API-local feature-flag adapter interface. The server contract only depends
 * on getEnabledFlags; isEnabled remains useful for local adapter callers.
 */
export type FeatureFlagServiceType = Readonly<{
  isEnabled: (
    flag: FeatureFlagKey,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<boolean> | boolean;
  getEnabledFlags: (
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<readonly FeatureFlagKey[]> | readonly FeatureFlagKey[];
}>;

export function getFeatureFlagService(): FeatureFlagServiceType {
  const usePostHog =
    process.env.USE_POSTHOG === "true" || process.env.NODE_ENV === "production";

  return usePostHog ? new PostHogFeatureFlagAdapter() : createInMemoryFeatureFlags();
}
