import type { ArtifactEnvironment } from "@oaknational/resource-adapter-storage";

/** Vercel custom environments, including staging, use VERCEL_ENV=preview. */
export function isDeployment(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production"
  );
}

export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function isProductionMode(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Names the key prefix this deployment writes artifacts under. Preview and the
 * staging custom environment share a bucket but must not share a prefix, and
 * `VERCEL_ENV` reports both as `preview`, so only `VERCEL_TARGET_ENV` separates
 * them.
 */
export function storageEnvironment(): ArtifactEnvironment {
  if (isProductionDeployment()) {
    return "production";
  }

  if (process.env.VERCEL_TARGET_ENV === "staging") {
    return "staging";
  }

  return isDeployment() ? "preview" : "local";
}
