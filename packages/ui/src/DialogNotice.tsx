"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  OakBox,
  OakFlex,
  OakPrimaryButton,
  OakSecondaryButton,
} from "@oaknational/oak-components";

export type DialogNoticeAction = Readonly<{
  label: string;
  onClick: () => void;
  isLoading?: boolean;
}>;

export type DialogNoticeProps = Readonly<{
  heading: string;
  /** Paragraphs, which can contain links. */
  children: ReactNode;
  secondaryAction: DialogNoticeAction;
  primaryAction?: DialogNoticeAction;
}>;

/**
 * A notice shown in the dialog body in place of a capability: a heading, body and
 * actions in a narrow column. Its heading is an h3, below the dialog's title.
 */
export function DialogNotice({
  children,
  heading,
  primaryAction,
  secondaryAction,
}: DialogNoticeProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <OakFlex $justifyContent="center" $pv="spacing-56" $width="100%">
      <OakFlex
        $alignItems="flex-start"
        $flexDirection="column"
        $gap="spacing-32"
        $width={["100%", "50%"]}
      >
        <OakBox
          as="h3"
          $font="heading-5"
          $ma="spacing-0"
          ref={headingRef}
          tabIndex={-1}
        >
          {heading}
        </OakBox>
        <OakFlex $flexDirection="column" $gap="spacing-16">
          {children}
        </OakFlex>
        <OakFlex $flexWrap="wrap" $gap="spacing-16">
          <OakSecondaryButton
            isLoading={secondaryAction.isLoading ?? false}
            onClick={secondaryAction.onClick}
            type="button"
          >
            {secondaryAction.label}
          </OakSecondaryButton>
          {primaryAction && (
            <OakPrimaryButton
              isLoading={primaryAction.isLoading ?? false}
              onClick={primaryAction.onClick}
              type="button"
            >
              {primaryAction.label}
            </OakPrimaryButton>
          )}
        </OakFlex>
      </OakFlex>
    </OakFlex>
  );
}
