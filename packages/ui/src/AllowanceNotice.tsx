"use client";

import { OakP } from "@oaknational/oak-components";
import type { LimitedTeacherAllowance } from "@oaknational/resource-adapter-contracts/internal";

import { DialogNotice } from "./DialogNotice.js";

// Allowances reset at midnight UK time, so the UK date is the one to name.
const ukDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
});

function resources(count: number): string {
  return count === 1 ? "resource" : "resources";
}

function heading({ limit, remaining }: LimitedTeacherAllowance): string {
  if (remaining === 0) return `You've adapted ${limit} ${resources(limit)} this month`;
  if (remaining === limit) {
    return `You can adapt up to ${limit} ${resources(limit)} a month`;
  }
  return `You can adapt ${remaining} more ${resources(remaining)} this month`;
}

export function AllowanceNotice({
  allowance,
  onBack,
  onContinue,
}: Readonly<{
  allowance: LimitedTeacherAllowance;
  onBack: () => void;
  onContinue: () => void;
}>) {
  const { limit, remaining, resetsAt } = allowance;
  return (
    <DialogNotice
      heading={heading(allowance)}
      {...(remaining === 0
        ? {}
        : {
            primaryAction: {
              label: remaining === limit ? "Start adapting" : "Continue adapting",
              onClick: onContinue,
            },
          })}
      secondaryAction={{ label: "Back to lesson", onClick: onBack }}
    >
      <OakP $font="body-2">
        Outside the UK, you can adapt up to {limit} lesson {resources(limit)} a month
        with AI. You can still make changes to resources you&rsquo;ve already adapted,
        and your limit resets on {ukDate.format(new Date(resetsAt))}.
      </OakP>
    </DialogNotice>
  );
}
