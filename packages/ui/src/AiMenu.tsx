"use client";

import { useId, type ReactNode } from "react";
import {
  OakButtonWithDropdown,
  OakFlex,
  OakLeftAlignedButton,
  OakScreenReader,
  OakSpan,
  useDropdownContext,
} from "@oaknational/oak-components";

/** A placeholder until the real page exists. */
export const ABOUT_OAKS_AI_URL = "https://www.oaknationalacademy.com/ai";

export function AiMenuSection({
  children,
  heading,
}: Readonly<{ children: ReactNode; heading: string }>) {
  const headingId = useId();
  return (
    <OakFlex
      aria-labelledby={headingId}
      $flexDirection="column"
      $gap="spacing-8"
      role="group"
    >
      <OakSpan
        aria-hidden="true"
        $color="text-subdued"
        $font="body-2"
        $ph="spacing-8"
        $pv="spacing-8"
        id={headingId}
      >
        {heading}
      </OakSpan>
      {children}
    </OakFlex>
  );
}

export function AiMenuButton({
  children,
  onSelect,
}: Readonly<{ children: ReactNode; onSelect: () => void }>) {
  const { onClose } = useDropdownContext();
  return (
    <OakLeftAlignedButton
      element="button"
      onClick={() => {
        onSelect();
        onClose();
      }}
      role="menuitem"
      width="100%"
    >
      {children}
    </OakLeftAlignedButton>
  );
}

export function AiMenuLink({
  children,
  href,
  onSelect,
}: Readonly<{ children: ReactNode; href: string; onSelect: () => void }>) {
  const { onClose } = useDropdownContext();
  return (
    <OakLeftAlignedButton
      element="a"
      href={href}
      iconAriaHidden
      iconName="external"
      isTrailingIcon
      onClick={() => {
        onSelect();
        onClose();
      }}
      rel="noopener noreferrer"
      role="menuitem"
      target="_blank"
      width="100%"
    >
      {children}
      <OakScreenReader> (opens in a new tab)</OakScreenReader>
    </OakLeftAlignedButton>
  );
}

export function LearnMoreSection({ onSelect }: Readonly<{ onSelect: () => void }>) {
  return (
    <>
      <OakButtonWithDropdown.Divider />
      <AiMenuSection heading="Learn more">
        <AiMenuLink href={ABOUT_OAKS_AI_URL} onSelect={onSelect}>
          About Oak&apos;s AI
        </AiMenuLink>
      </AiMenuSection>
    </>
  );
}
