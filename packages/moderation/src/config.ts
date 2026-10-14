export const MODERATION_ENV_VARS = {
  apiUrl: "MODERATION_API_URL",
  bypassSecret: "MODERATION_API_BYPASS_SECRET",
} as const;

/** Longer than the moderation service's own 30s Vercel limit, so its 504 arrives before we give up. */
export const DEFAULT_MODERATION_TIMEOUT_MS = 35_000;

export type ModerationConfig = Readonly<{
  apiUrl: string;
  bypassSecret?: string;
  timeoutMs?: number;
}>;

export function moderationConfigFromEnv(
  env: Record<string, string | undefined>,
): ModerationConfig {
  const apiUrl = (env[MODERATION_ENV_VARS.apiUrl] ?? "").trim();
  if (apiUrl === "") {
    throw new Error(
      `The moderation service is not configured: ${MODERATION_ENV_VARS.apiUrl} is missing or blank.`,
    );
  }

  const bypassSecret = (env[MODERATION_ENV_VARS.bypassSecret] ?? "").trim();
  return bypassSecret === "" ? { apiUrl } : { apiUrl, bypassSecret };
}
