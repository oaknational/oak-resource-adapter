"use client";

import { OakInlineBanner, OakP, OakSecondaryButton } from "@oaknational/oak-components";

import type { WithheldSafetyResult } from "@oaknational/resource-adapter-contracts/internal";

// Placeholder copy until design signs off the wording.
const REASONS: Readonly<Record<WithheldSafetyResult, string>> = {
  "highly-sensitive":
    "We can't show this scaffold because it covers a highly sensitive topic.",
  toxic:
    "We can't show this scaffold because it doesn't meet Oak's community standards.",
};

/** It sits inside the worksheet's own heading outline, so its title is not a heading. */
export function WithheldScaffoldNotice({
  disabled,
  keepsEarlierVersion,
  onTryAgain,
  safetyResult,
}: Readonly<{
  disabled: boolean;
  /** A retry was withheld, so the scaffold awaiting review is still the earlier one. */
  keepsEarlierVersion: boolean;
  onTryAgain: () => void;
  safetyResult: WithheldSafetyResult;
}>) {
  const reason = REASONS[safetyResult];
  return (
    <div aria-atomic="true" role="alert">
      <OakInlineBanner
        isOpen
        cta={
          keepsEarlierVersion ? null : (
            <OakSecondaryButton disabled={disabled} onClick={onTryAgain}>
              Try again
            </OakSecondaryButton>
          )
        }
        message={
          <>
            <OakP $font="heading-7">Sorry, we couldn&apos;t show that scaffold</OakP>
            <OakP $font="body-2">
              {keepsEarlierVersion
                ? `${reason} Your earlier version is still here for you to review.`
                : `${reason} You can try again or choose another suggestion.`}
            </OakP>
          </>
        }
        type="warning"
        variant="regular"
      />
    </div>
  );
}
