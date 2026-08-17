import { createInMemoryFeatureFlags } from "./in-memory";
import { PostHogFeatureFlagAdapter } from "./posthog-adapter";
import type { FeatureFlagServiceType } from "./types";

export type { FeatureFlagServiceType } from "./types";

export function getFeatureFlagService(): FeatureFlagServiceType {
  const usePostHog =
    process.env.USE_POSTHOG === "true" || process.env.NODE_ENV === "production";

  return usePostHog ? new PostHogFeatureFlagAdapter() : createInMemoryFeatureFlags();
}
