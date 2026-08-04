import { raLogger } from "@oaknational/resource-adapter-logger";
import {
  featureFlagCatalogue,
  type FeatureFlagKey,
  type FeatureFlagServiceType,
  type ResourceAdapterAuthenticatedTeacher,
} from "@oaknational/resource-adapter-contracts/server";
import { PostHog } from "posthog-node";

const log = raLogger("feature-flags");

let client: PostHog | null = null;
function getClient(): PostHog {
  if (!client) {
    client = new PostHog(process.env.POSTHOG_API_KEY!, {
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
