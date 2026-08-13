export type OakCurriculumConfig = Readonly<{
  apiKey: string;
  endpoint: string;
  timeoutMs?: number;
}>;

export type ResolvedOakCurriculumConfig = Readonly<
  Omit<OakCurriculumConfig, "timeoutMs"> & { timeoutMs: number }
>;

export type OakResourceStoreConfig = Readonly<{
  downloadsApiUrl: string;
  timeoutMs?: number;
}>;

export const DEFAULT_CURRICULUM_TIMEOUT_MS = 5_000;
export const DEFAULT_RESOURCE_TIMEOUT_MS = 15_000;

export const CURRICULUM_ENV_VARS = {
  apiKey: "CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY",
  endpoint: "CURRICULUM_API_URL",
} as const;

export const RESOURCE_STORE_ENV_VARS = {
  downloadsApiUrl: "CURRICULUM_DOWNLOADS_API_URL",
} as const;

// setTimeout truncates anything larger to a 32-bit signed integer, which fires
// the abort immediately instead of never.
const MAX_TIMEOUT_MS = 2_147_483_647;

export function resolveTimeoutMs(
  timeoutMs: number | undefined,
  fallback: number,
): number {
  const resolved = timeoutMs ?? fallback;

  if (!Number.isInteger(resolved) || resolved <= 0 || resolved > MAX_TIMEOUT_MS) {
    throw new RangeError(
      `timeoutMs must be a positive integer no greater than ${MAX_TIMEOUT_MS}, got ${timeoutMs}`,
    );
  }

  return resolved;
}

export function resolveOakCurriculumConfig(
  config: OakCurriculumConfig,
): ResolvedOakCurriculumConfig {
  return {
    ...config,
    timeoutMs: resolveTimeoutMs(config.timeoutMs, DEFAULT_CURRICULUM_TIMEOUT_MS),
  };
}

export function oakCurriculumConfigFromEnv(
  env: Record<string, string | undefined>,
): OakCurriculumConfig {
  requireConfigured(env, CURRICULUM_ENV_VARS, "Oak's curriculum endpoint");

  return {
    apiKey: (env[CURRICULUM_ENV_VARS.apiKey] as string).trim(),
    endpoint: (env[CURRICULUM_ENV_VARS.endpoint] as string).trim(),
  };
}

export function oakResourceStoreConfigFromEnv(
  env: Record<string, string | undefined>,
): OakResourceStoreConfig {
  requireConfigured(env, RESOURCE_STORE_ENV_VARS, "Oak's downloads API");

  return {
    downloadsApiUrl: (env[RESOURCE_STORE_ENV_VARS.downloadsApiUrl] as string).trim(),
  };
}

function requireConfigured(
  env: Record<string, string | undefined>,
  names: Readonly<Record<string, string>>,
  what: string,
): void {
  const missing = Object.values(names)
    .filter((name) => (env[name] ?? "").trim() === "")
    .sort();

  if (missing.length > 0) {
    throw new Error(
      `${what} is not configured: ${missing.join(" and ")} ${
        missing.length === 1 ? "is" : "are"
      } missing or blank.`,
    );
  }
}
