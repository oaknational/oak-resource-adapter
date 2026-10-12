"use client";

import { OakFlex, OakHeading, OakP } from "@oaknational/oak-components";
import type { TeacherAllowance } from "@oaknational/resource-adapter-contracts/internal";

import { ukDate } from "./workflowStatus.js";

function adaptations(count: number): string {
  return count === 1 ? "1 adaptation" : `${count} adaptations`;
}

const MAX_BAR_SEGMENTS = 10;

/** Matches the neutral and warning `OakInlineBanner` types. */
const SCHEMES = {
  remaining: {
    background: "bg-neutral",
    border: "border-neutral-lighter",
    unusedSegment: "bg-neutral-stronger",
  },
  usedUp: {
    background: "bg-decorative6-very-subdued",
    border: "border-decorative6",
    unusedSegment: "bg-decorative6-subdued",
  },
} as const;

export function AllowanceSummary({
  allowance,
}: Readonly<{ allowance: TeacherAllowance | null }>) {
  if (allowance?.tier !== "limited") {
    return null;
  }
  const { limit, remaining } = allowance;
  const scheme = SCHEMES[remaining === 0 ? "usedUp" : "remaining"];
  const resets = `Your allowance resets on ${ukDate.format(new Date(allowance.resetsAt))}.`;

  return (
    <OakFlex
      $background={scheme.background}
      $ba="border-solid-s"
      $borderColor={scheme.border}
      $borderRadius="border-radius-m"
      $flexDirection="column"
      $gap="spacing-12"
      $pa="spacing-16"
      data-testid="worksheet-scaffolding-allowance"
    >
      <OakHeading $font="heading-7" tag="h3">
        {remaining === 0
          ? "No adaptations left this month"
          : `${remaining} of ${adaptations(limit)} left this month`}
      </OakHeading>
      {limit <= MAX_BAR_SEGMENTS && (
        <OakFlex
          $gap="spacing-4"
          $maxWidth="spacing-240"
          $width="100%"
          aria-hidden="true"
          data-testid="worksheet-scaffolding-allowance-bar"
        >
          {Array.from({ length: limit }, (_, index) => (
            <OakFlex
              $background={index < remaining ? "bg-btn-primary" : scheme.unusedSegment}
              $borderRadius="border-radius-circle"
              $flexGrow={1}
              $height="spacing-8"
              key={index}
            />
          ))}
        </OakFlex>
      )}
      <OakP $font="body-2">
        {remaining === 0
          ? `You can keep working on worksheets you've started. ${resets}`
          : resets}
      </OakP>
    </OakFlex>
  );
}
