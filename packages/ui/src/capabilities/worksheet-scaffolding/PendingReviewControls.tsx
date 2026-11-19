"use client";

import { useId, useState } from "react";
import {
  OakFlex,
  OakIcon,
  OakP,
  OakPrimaryButton,
  OakSecondaryButton,
  parseColor,
} from "@oaknational/oak-components";
import { styled } from "styled-components";

import type { ContentGuidance } from "@oaknational/resource-adapter-contracts/internal";

import { ActionRow } from "./styles.js";

const ReviewDisclosure = styled.button`
  align-items: center;
  background: none;
  border: 0;
  color: ${parseColor("text-link-active")};
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-weight: 700;
  gap: 0.5rem;
  min-height: 1.5rem;
  padding: 0;
  text-align: left;
  text-decoration: underline;

  &:focus-visible {
    outline: 0.1875rem solid ${parseColor("border-inverted")};
    outline-offset: 0.125rem;
  }
`;

const ReviewChevron = styled(OakIcon)<{ $isOpen: boolean }>`
  flex: 0 0 auto;
  transform: rotate(${({ $isOpen }) => ($isOpen ? "180deg" : "0deg")});
  transition: transform 0.2s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ContentGuidanceBadge = styled.p`
  align-self: flex-start;
  background: ${parseColor("bg-decorative5-very-subdued")};
  border: 1px solid ${parseColor("border-decorative5-stronger")};
  border-radius: 0.5rem;
  color: ${parseColor("text-primary")};
  line-height: 1.4;
  margin: 0;
  padding: 0.25rem 0.5rem;
`;

export function PendingReviewControls({
  contentGuidance,
  disabled,
  onAccept,
  onRetry,
  onUndo,
  reason,
  retryDisabled,
}: Readonly<{
  contentGuidance: readonly ContentGuidance[];
  disabled: boolean;
  onAccept: () => void;
  onRetry: () => void;
  onUndo: () => void;
  reason: string;
  retryDisabled: boolean;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <OakFlex $flexDirection="column" $gap="spacing-12">
      {contentGuidance.length > 0 && (
        <ContentGuidanceBadge>
          <strong>Content guidance:</strong>{" "}
          {contentGuidance.map(({ label }) => label).join(", ")}
        </ContentGuidanceBadge>
      )}
      <div>
        <ReviewDisclosure
          aria-controls={panelId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          How this can support your pupils
          <ReviewChevron
            $height="spacing-24"
            $isOpen={isOpen}
            $width="spacing-24"
            alt=""
            aria-hidden="true"
            iconName="chevron-down"
          />
        </ReviewDisclosure>
      </div>
      <OakP hidden={!isOpen} id={panelId}>
        {reason}
      </OakP>
      <ActionRow>
        <OakSecondaryButton disabled={disabled} iconName="arrow-left" onClick={onUndo}>
          Undo
        </OakSecondaryButton>
        <OakSecondaryButton
          disabled={disabled || retryDisabled}
          iconName="retake"
          onClick={onRetry}
        >
          Retry
        </OakSecondaryButton>
        <OakPrimaryButton disabled={disabled} onClick={onAccept}>
          Accept
        </OakPrimaryButton>
      </ActionRow>
    </OakFlex>
  );
}
