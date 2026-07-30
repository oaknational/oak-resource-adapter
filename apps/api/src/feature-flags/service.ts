import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import { createInMemoryFeatureFlags } from "./in-memory";
import type { FeatureFlagKey } from "./catalogue";
import { PostHogFeatureFlagAdapter } from "./posthogAdapter";

export type FeatureFlagServiceType = {
  isEnabled: (
    flag: FeatureFlagKey,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<boolean> | boolean;
};

const usePostHog =
  process.env.NODE_ENV === "production" || process.env.USE_POSTHOG === "true";

export const FeatureFlagService = usePostHog
  ? new PostHogFeatureFlagAdapter()
  : createInMemoryFeatureFlags();
