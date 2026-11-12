"use client";

import {
  OakFlex,
  OakLink,
  OakP,
  OakScreenReader,
  OakSmallTertiaryInvertedButton,
  OakTagFunctional,
} from "@oaknational/oak-components";

export const FEEDBACK_FORM_URL = "https://www.thenational.academy/contact-us";

export function ViewHeader({
  onBackToLesson,
}: Readonly<{ onBackToLesson: () => void }>) {
  return (
    <OakFlex $flexDirection="column" $gap="spacing-24">
      <OakFlex $alignItems="flex-start" $gap="spacing-12">
        <OakTagFunctional
          $background="bg-decorative3-main"
          $borderRadius="border-radius-s"
          $flexShrink={0}
          label="Beta"
          useSpan
        />
        <OakP $font="body-2">
          This is a new feature &ndash;{" "}
          <OakLink href={FEEDBACK_FORM_URL} rel="noopener noreferrer" target="_blank">
            your feedback <OakScreenReader>(opens in a new tab)</OakScreenReader>
          </OakLink>{" "}
          will help us improve it.
        </OakP>
      </OakFlex>
      <OakFlex>
        <OakSmallTertiaryInvertedButton
          $font="body-3"
          element="button"
          iconName="chevron-left"
          onClick={onBackToLesson}
        >
          Back to lesson
        </OakSmallTertiaryInvertedButton>
      </OakFlex>
    </OakFlex>
  );
}
