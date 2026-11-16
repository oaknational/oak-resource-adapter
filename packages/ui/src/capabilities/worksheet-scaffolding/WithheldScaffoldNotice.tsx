"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { OakInlineBanner, OakP, OakSecondaryButton } from "@oaknational/oak-components";
import { styled } from "styled-components";

import type { WithheldSafetyResult } from "@oaknational/resource-adapter-contracts/internal";

const NoticeGroup = styled.fieldset`
  border: 0;
  margin: 0;
  /* A fieldset is otherwise at least as wide as its content, so long text overflows. */
  min-inline-size: 0;
  padding: 0;
`;

// Placeholder copy until design signs off the wording.
const REASONS: Readonly<Record<WithheldSafetyResult, string>> = {
  "highly-sensitive":
    "We can't show this scaffold because it covers a highly sensitive topic.",
  toxic:
    "We can't show this scaffold because it doesn't meet Oak's community standards.",
};

/**
 * Takes focus when it replaces the progress of the teacher's own apply or
 * retry, so a screen reader announces its name and reason. A notice already
 * present when the worksheet opens leaves focus where it is. It sits inside
 * the worksheet's own heading outline, so its title is not a heading.
 */
export function WithheldScaffoldNotice({
  disabled,
  keepsEarlierVersion,
  onTryAgain,
  safetyResult,
  wasWorking,
}: Readonly<{
  disabled: boolean;
  /** A retry was withheld, so the scaffold awaiting review is still the earlier one. */
  keepsEarlierVersion: boolean;
  onTryAgain: () => void;
  safetyResult: WithheldSafetyResult;
  /** Whether work was in progress at the previous render, read once on mount. */
  wasWorking: RefObject<boolean>;
}>) {
  const ref = useRef<HTMLFieldSetElement | null>(null);
  const titleId = useId();
  const reasonId = useId();
  useEffect(() => {
    if (wasWorking.current) {
      ref.current?.focus();
    }
  }, [wasWorking]);

  const reason = REASONS[safetyResult];
  return (
    <NoticeGroup
      aria-describedby={reasonId}
      aria-labelledby={titleId}
      ref={ref}
      tabIndex={-1}
    >
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
            <OakP $font="heading-7" id={titleId}>
              Sorry, we couldn&apos;t show that scaffold
            </OakP>
            <OakP $font="body-2" id={reasonId}>
              {keepsEarlierVersion
                ? `${reason} Your earlier version is still here for you to review.`
                : `${reason} You can try again or choose another suggestion.`}
            </OakP>
          </>
        }
        type="warning"
        variant="regular"
      />
    </NoticeGroup>
  );
}
