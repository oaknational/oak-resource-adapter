import { raLogger } from "@oaknational/resource-adapter-logger";

const log = raLogger("feature-flags");
import { PostHog } from "posthog-node";
import { type FeatureFlagKey } from "./catalogue";
import type { FeatureFlagServiceType } from "./service";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

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
}
