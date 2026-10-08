import type { UsageLimitReached } from "@oaknational/resource-adapter-contracts/internal";

import { modelJobLimitRetryAt } from "./repository";

export type UsageCheck =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; usageLimit: UsageLimitReached }>;

export type UsageLimiter = Readonly<{
  check: (teacherId: string) => Promise<UsageCheck>;
}>;

const DEFAULT_MODEL_JOBS_PER_24H = 100;

/** Unset falls back to the production limit, so a missing value never means unlimited. */
export function modelJobsPer24hLimit(configured: string | undefined): number {
  const value = configured?.trim() ?? "";
  if (value === "") {
    return DEFAULT_MODEL_JOBS_PER_24H;
  }
  const limit = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("USAGE_LIMIT_MODEL_JOBS_PER_24H must be a positive integer.");
  }
  return limit;
}

type LimiterDependencies = Readonly<{
  limit: () => number;
  retryAt: typeof modelJobLimitRetryAt;
}>;

const defaultDependencies: LimiterDependencies = {
  limit: () => modelJobsPer24hLimit(process.env.USAGE_LIMIT_MODEL_JOBS_PER_24H),
  retryAt: modelJobLimitRetryAt,
};

export function createModelJobLimiter(
  dependencies: LimiterDependencies = defaultDependencies,
): UsageLimiter {
  return {
    async check(teacherId) {
      const retryAt = await dependencies.retryAt(teacherId, dependencies.limit());
      return retryAt === null
        ? { allowed: true }
        : {
            allowed: false,
            usageLimit: { kind: "model_jobs_24h", retryAt: retryAt.toISOString() },
          };
    },
  };
}
