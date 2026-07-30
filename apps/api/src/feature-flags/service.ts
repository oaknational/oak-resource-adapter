import { createInMemoryFeatureFlags } from "./in-memory";
import { PostHogFeatureFlagAdapter } from "./posthogAdapter";

const usePostHog =
  process.env.NODE_ENV === "production" || process.env.USE_POSTHOG === "true";

export const FeatureFlagService = usePostHog
  ? new PostHogFeatureFlagAdapter()
  : createInMemoryFeatureFlags();
