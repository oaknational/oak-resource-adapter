import type { TeacherAllowance } from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import { type CalendarMonth, ukCalendarMonth } from "../calendar/uk-calendar-month";
import type { TeacherAccess } from "../teacher-access/access";
import {
  teacherAccessResolver,
  type TeacherAccessResolver,
} from "../teacher-access/resolver";
import {
  type AdaptationAllowance,
  adaptedResourcesSince,
} from "./adaptation-allowance";
import { adaptedResourcesPerMonthLimit } from "./monthly-allowance";

export type AllowanceDependencies = Readonly<{
  access: TeacherAccessResolver;
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

type TeacherAllowanceDependencies = AllowanceDependencies & {
  adaptedResourcesSince: typeof adaptedResourcesSince;
};

const defaultDependencies: TeacherAllowanceDependencies = {
  ...allowanceDependencies,
  adaptedResourcesSince,
};

export async function getTeacherAllowance(
  target: ResourceAdapterAuthenticatedTeacher,
  {
    access,
    adaptedResourcesPerMonth,
    adaptedResourcesSince,
    now,
  }: TeacherAllowanceDependencies = defaultDependencies,
): Promise<TeacherAllowance> {
  const cached = await access.resolve(target.teacherId);
  // A cached lookup can predate a grant.
  const current =
    cached.tier === "limited" ? await access.recheck(target.teacherId) : cached;
  const month = ukCalendarMonth(now());
  const allowance = adaptationAllowanceFor(current, month, adaptedResourcesPerMonth());
  if (allowance === "unlimited") return { tier: "full" };
  const adapted = await adaptedResourcesSince(target.teacherId, allowance.since);
  return {
    limit: allowance.limit,
    remaining: Math.max(0, allowance.limit - adapted.length),
    resetsAt: month.resetsAt.toISOString(),
    tier: "limited",
  };
}
