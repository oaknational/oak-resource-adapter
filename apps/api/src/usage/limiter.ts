import type { UsageLimitReached } from "@oaknational/resource-adapter-contracts/internal";

import type { TeacherAccess } from "../teacher-access/access";
import {
  teacherAccessResolver,
  type TeacherAccessResolver,
} from "../teacher-access/resolver";
import { configuredLimit } from "./configured-limit";
import { modelJobLimitRetryAt } from "./repository";

export type UsageCheck =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; usageLimit: UsageLimitReached<"model_jobs_24h"> }>;

export type UsageLimiter = Readonly<{
  check: (teacherId: string) => Promise<UsageCheck>;
}>;

const DEFAULT_MODEL_JOBS_PER_24H = 100;

export function modelJobsPer24hLimit(configured: string | undefined): number {
  return configuredLimit(
    "USAGE_LIMIT_MODEL_JOBS_PER_24H",
    configured,
    DEFAULT_MODEL_JOBS_PER_24H,
  );
}

type LimiterDependencies = Readonly<{
  access: TeacherAccessResolver;
  limit: () => number;
  retryAt: typeof modelJobLimitRetryAt;
}>;

const defaultDependencies: LimiterDependencies = {
  access: teacherAccessResolver,
  limit: () => modelJobsPer24hLimit(process.env.USAGE_LIMIT_MODEL_JOBS_PER_24H),
  retryAt: modelJobLimitRetryAt,
};

export function createModelJobLimiter(
  dependencies: LimiterDependencies = defaultDependencies,
): UsageLimiter {
  return {
    async check(teacherId) {
      const blockedUntil = (access: TeacherAccess) =>
        dependencies.retryAt(teacherId, access.modelJobsPer24h ?? dependencies.limit());
      let retryAt = await blockedUntil(await dependencies.access.resolve(teacherId));
      if (retryAt !== null) {
        // A cached lookup can predate a raised limit.
        retryAt = await blockedUntil(await dependencies.access.recheck(teacherId));
      }
      return retryAt === null
        ? { allowed: true }
        : {
            allowed: false,
            usageLimit: { kind: "model_jobs_24h", retryAt: retryAt.toISOString() },
          };
    },
  };
}
