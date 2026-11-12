import type {
  AccessPolicy,
  AccountGate,
} from "@oaknational/resource-adapter-dev-api-contracts";

import { FULL_ACCESS_REGIONS } from "../teacher-access/access";
import { adaptedResourcesPerMonthLimit } from "../usage/monthly-allowance";

/** Built as descriptions rather than rules: each leads to its own outcome, not a refusal. */
export const ACCOUNT_GATES: readonly AccountGate[] = [
  {
    id: "signed-in",
    label: "Sign in",
    description:
      "A signed-out teacher is offered ORA on a lesson that passes the lesson and capability rules, and signs in to use it.",
    untilMet: "asked to sign in",
    status: "in-place",
  },
  {
    id: "onboarded",
    label: "Finish Oak onboarding",
    description:
      "A signed-in teacher finishes OWA onboarding before ORA offers anything.",
    untilMet: "asked to finish setup",
    status: "in-place",
  },
  {
    id: "terms",
    label: "Accept ORA's terms",
    description:
      "A teacher accepts ORA's terms the first time they open ORA (ADAPT-150).",
    untilMet: "shown the terms",
    status: "planned",
  },
];

export function accessPolicies(): readonly AccessPolicy[] {
  const adaptedResourcesPerMonth = adaptedResourcesPerMonthLimit(
    process.env.USAGE_LIMIT_ADAPTED_RESOURCES_PER_MONTH,
  );
  return [
    {
      id: "access-tier",
      label: "Access tier",
      description:
        "Full access for a teacher with an ORA grant, a verified Oak address, a stored region in the full-access regions, or Aila's full access, unless an access-limit-me test address marks them as outside the UK without a grant. Every other teacher has a monthly allowance.",
      outcomes: [
        {
          label:
            "Teachers in the UK and Crown dependencies, Oak staff, and teachers with a grant or Aila full access",
          result: "No limit",
        },
        {
          label: "Everyone else",
          result: `${adaptedResourcesPerMonth} resources a month`,
        },
      ],
      config: { adaptedResourcesPerMonth, fullAccessRegions: FULL_ACCESS_REGIONS },
    },
  ];
}
