import { isProductionMode, isProductionDeployment } from "../environment";
import { createInMemoryFeatureFlags } from "./in-memory";
import { PostHogFeatureFlagAdapter } from "./posthog-adapter";
import type { FeatureFlagServiceType } from "./types";

export type { FeatureFlagServiceType } from "./types";

export class FeatureFlagConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureFlagConfigurationError";
  }
}

function useInMemoryFlagsByRequest(): boolean {
  if (process.env.FEATURE_FLAG_TRANSPORT !== "in-memory") {
    return false;
  }
  if (isProductionDeployment()) {
    throw new FeatureFlagConfigurationError(
      "FEATURE_FLAG_TRANSPORT=in-memory is not allowed in production.",
    );
  }
  return true;
}

export function getFeatureFlagService(): FeatureFlagServiceType {
  if (useInMemoryFlagsByRequest()) {
    return createInMemoryFeatureFlags();
  }

  // Preview and staging also run in production mode and require PostHog keys.
  const usePostHog = process.env.USE_POSTHOG === "true" || isProductionMode();

  return usePostHog ? new PostHogFeatureFlagAdapter() : createInMemoryFeatureFlags();
}
