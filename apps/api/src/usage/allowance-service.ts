import type {
  LimitedTeacherAllowance,
  TeacherAllowance,
} from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import { type CalendarMonth, ukCalendarMonth } from "../calendar/uk-calendar-month";
import type { TeacherAccess } from "../teacher-access/access";
import {
  teacherAccessResolver,
  type TeacherAccessResolver,
} from "../teacher-access/resolver";
import {
  type AdaptationAllowance,
  type AdaptedResource,
  adaptedResourcesSince,
  isCounted,
  type ResourceToAdapt,
} from "./adaptation-allowance";
import { adaptedResourcesPerMonthLimit } from "./monthly-allowance";

export type AllowanceDependencies = Readonly<{
  access: Pick<TeacherAccessResolver, "recheck" | "resolve">;
  adaptedResourcesPerMonth: () => number;
  now: () => Date;
}>;

export const allowanceDependencies: AllowanceDependencies = {
  access: teacherAccessResolver,
  adaptedResourcesPerMonth: () =>
    adaptedResourcesPerMonthLimit(process.env.USAGE_LIMIT_ADAPTED_RESOURCES_PER_MONTH),
  now: () => new Date(),
};

export function adaptationAllowanceFor(
  { tier }: TeacherAccess,
  month: CalendarMonth,
  limit: number,
): AdaptationAllowance {
  return tier === "full" ? "unlimited" : { limit, since: month.since };
}

export type TeacherAllowanceDependencies = AllowanceDependencies & {
  adaptedResourcesSince: typeof adaptedResourcesSince;
};

const defaultDependencies: TeacherAllowanceDependencies = {
  ...allowanceDependencies,
  adaptedResourcesSince,
};

type MonthlyUsage = Readonly<{
  allowance: LimitedTeacherAllowance;
  counted: readonly AdaptedResource[];
}>;

async function usageThisMonth(
  target: ResourceAdapterAuthenticatedTeacher,
  {
    access,
    adaptedResourcesPerMonth,
    adaptedResourcesSince,
    now,
  }: TeacherAllowanceDependencies,
): Promise<MonthlyUsage | null> {
  const cached = await access.resolve(target.teacherId);
  // A cached lookup can predate a grant.
  const current =
    cached.tier === "limited" ? await access.recheck(target.teacherId) : cached;
  const month = ukCalendarMonth(now());
  const allowance = adaptationAllowanceFor(current, month, adaptedResourcesPerMonth());
  if (allowance === "unlimited") return null;
  const counted = await adaptedResourcesSince(target.teacherId, allowance.since);
  return {
    allowance: {
      limit: allowance.limit,
      remaining: Math.max(0, allowance.limit - counted.length),
      resetsAt: month.resetsAt.toISOString(),
      tier: "limited",
    },
    counted,
  };
}

export async function getTeacherAllowance(
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: TeacherAllowanceDependencies = defaultDependencies,
): Promise<TeacherAllowance> {
  const usage = await usageThisMonth(target, dependencies);
  return usage?.allowance ?? { tier: "full" };
}

/** Null when opening the resource would not spend an adaptation. */
export async function allowanceIfSpending(
  target: ResourceAdapterAuthenticatedTeacher,
  resource: ResourceToAdapt,
  dependencies: TeacherAllowanceDependencies = defaultDependencies,
): Promise<LimitedTeacherAllowance | null> {
  const usage = await usageThisMonth(target, dependencies);
  return usage === null || isCounted(usage.counted, resource) ? null : usage.allowance;
}
