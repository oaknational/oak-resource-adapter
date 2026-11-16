"use client";

import {
  OakFlex,
  OakHeading,
  OakP,
  OakPrimaryButton,
  OakSecondaryButton,
} from "@oaknational/oak-components";
import type { WorksheetScaffoldingResumable } from "@oaknational/resource-adapter-contracts/internal";

function scaffoldSummary(count: number): string {
  return count === 1 ? "1 scaffold" : `${count} scaffolds`;
}

function pendingReviewSentence(count: number): string {
  if (count === 0) {
    return "";
  }
  return count === 1
    ? "One scaffold is waiting for your review."
    : `${count} scaffolds are waiting for your review.`;
}

export function ResumeChoice({
  onResume,
  onStartFresh,
  resumable,
}: Readonly<{
  onResume: () => void;
  onStartFresh: () => void;
  resumable: WorksheetScaffoldingResumable;
}>) {
  const lastWorkedOn = new Date(resumable.updatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

  return (
    <OakFlex
      $background="bg-decorative3-very-subdued"
      $ba="border-solid-s"
      $borderColor="border-decorative3"
      $borderRadius="border-radius-m"
      $flexDirection="column"
      $gap="spacing-12"
      $pa="spacing-16"
    >
      <OakHeading $font="heading-6" tag="h3">
        Carry on with this worksheet?
      </OakHeading>
      <OakP $font="body-2">
        {[
          `This worksheet has ${scaffoldSummary(resumable.scaffoldCount)} from ${lastWorkedOn}.`,
          pendingReviewSentence(resumable.pendingScaffoldCount),
          "You can keep going, or start again from Oak’s original.",
        ]
          .filter((sentence) => sentence !== "")
          .join(" ")}
      </OakP>

      <OakFlex $flexWrap="wrap" $gap="spacing-8">
        <OakPrimaryButton onClick={onResume}>Carry on</OakPrimaryButton>
        <OakSecondaryButton onClick={onStartFresh}>
          Start from the original
        </OakSecondaryButton>
      </OakFlex>
    </OakFlex>
  );
}
