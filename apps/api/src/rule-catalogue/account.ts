import type {
  AccessPolicy,
  AccountGate,
} from "@oaknational/resource-adapter-dev-api-contracts";

import { COPYRIGHT_REGIONS, FULL_ACCESS_REGIONS } from "../teacher-access/access";
import { adaptedResourcesPerMonthLimit } from "../usage/monthly-allowance";

/** Built as descriptions rather than rules: each leads to its own outcome, not a refusal. */
export const ACCOUNT_GATES: readonly AccountGate[] = [
  {
    id: "signed-in",
    label: "Signed in",
    description:
      "A signed-out teacher is offered ORA on a lesson that passes the lesson and capability rules, and signs in to use it.",
    untilMet: "Offered after sign-in",
    status: "in-place",
  },
  {
    id: "onboarded",
    label: "Onboarded",
    description:
      "A signed-in teacher finishes OWA onboarding before ORA offers anything.",
    untilMet: "Asked to finish setup",
    status: "in-place",
  },
  {
    id: "terms",
    label: "Terms accepted",
    description:
      "A teacher accepts ORA's terms the first time they open ORA (ADAPT-150).",
    untilMet: "Shown the terms",
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
        { label: "Full access", result: "No monthly limit" },
        {
          label: "Limited",
          result: `Starts adapting up to ${adaptedResourcesPerMonth} resources a month`,
        },
      ],
      config: { adaptedResourcesPerMonth, fullAccessRegions: FULL_ACCESS_REGIONS },
    },
    {
      id: "copyright-region",
      label: "Copyright region",
      description:
        "Decides geo-restricted lessons, whatever the tier. An access-limit-me test address puts a teacher outside every copyright region.",
      outcomes: [
        { label: "In a copyright region", result: "Offered geo-restricted lessons" },
        { label: "Elsewhere", result: "Not offered geo-restricted lessons" },
      ],
      config: { copyrightRegions: COPYRIGHT_REGIONS },
    },
  ];
}
