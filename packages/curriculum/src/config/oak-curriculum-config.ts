export type OakCurriculumConfig = Readonly<{
  apiKey: string;
  endpoint: string;
  timeoutMs?: number;
}>;

export type ResolvedOakCurriculumConfig = Readonly<
  Omit<OakCurriculumConfig, "timeoutMs"> & { timeoutMs: number }
>;

export const DEFAULT_CURRICULUM_TIMEOUT_MS = 5_000;

export const CURRICULUM_ENV_VARS = {
  apiKey: "CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY",
  endpoint: "CURRICULUM_API_URL",
} as const;

export function oakCurriculumConfigFromEnv(
  env: Record<string, string | undefined>,
): OakCurriculumConfig {
  const missing = Object.values(CURRICULUM_ENV_VARS)
    .filter((name) => (env[name] ?? "").trim() === "")
    .sort();

  if (missing.length > 0) {
    throw new Error(
      `Oak's curriculum endpoint is not configured: ${missing.join(" and ")} ${
        missing.length === 1 ? "is" : "are"
      } missing or blank.`,
    );
  }

  return {
    apiKey: (env[CURRICULUM_ENV_VARS.apiKey] as string).trim(),
    endpoint: (env[CURRICULUM_ENV_VARS.endpoint] as string).trim(),
  };
}
