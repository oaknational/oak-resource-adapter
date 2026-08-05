import { raLogger } from "@oaknational/resource-adapter-logger";
import { type ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import { PostHog } from "posthog-node";

import { featureFlagCatalogue, type FeatureFlagKey } from "./catalogue";
import type { FeatureFlagServiceType } from "./service";

const log = raLogger("feature-flags");

let client: PostHog | null = null;
function getClient(): PostHog {
  if (!client) {
    if (!process.env.POSTHOG_API_KEY) {
      throw new Error(
        "POSTHOG_API_KEY is required when PostHog feature flags are enabled. Set NODE_ENV=development or USE_POSTHOG=false to use in-memory flags instead.",
      );
    }
    client = new PostHog(process.env.POSTHOG_API_KEY, {
      host: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
    });
  }
  return client;
}

export class PostHogFeatureFlagAdapter implements FeatureFlagServiceType {
  private client: PostHog;

  constructor() {
    this.client = getClient();
  }

  public async isEnabled(
    flag: FeatureFlagKey,
    target: ResourceAdapterAuthenticatedTeacher,
  ): Promise<boolean> {
    try {
      const featureFlagEvaluationsSnapshot = await this.client.evaluateFlags(
        target.teacherId,
      );

      return featureFlagEvaluationsSnapshot.isEnabled(flag);
    } catch (error) {
      log.error(error, { report: true });
      return false;
    }
  }

  public async getEnabledFlags(
    target: ResourceAdapterAuthenticatedTeacher,
  ): Promise<FeatureFlagKey[]> {
    try {
      const featureFlagEvaluationsSnapshot = await this.client.evaluateFlags(
        target.teacherId,
      );

      return Object.keys(featureFlagCatalogue).filter((flag) =>
        featureFlagEvaluationsSnapshot.isEnabled(flag as FeatureFlagKey),
      ) as FeatureFlagKey[];
    } catch (error) {
      log.error(error, { report: true });
      return [];
    }
  }
}
