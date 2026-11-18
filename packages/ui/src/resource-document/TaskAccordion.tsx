"use client";

import { useId, useState, type ReactNode } from "react";
import type { InlineContent } from "@oaknational/resource-document";
import {
  OakBox,
  OakFlex,
  OakHeading,
  OakIcon,
  parseColor,
  parseDropShadow,
} from "@oaknational/oak-components";
import { styled } from "styled-components";

import { InlineContentRenderer } from "./InlineContentRenderer.js";

const TaskToggle = styled.button`
  align-items: center;
  background: none;
  border: 0;
  border-radius: 0.25rem;
  color: ${parseColor("text-primary")};
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: 1rem;
  justify-content: space-between;
  padding: 0;
  scroll-margin-top: 7rem;
  text-align: left;
  width: 100%;

  &:focus-visible {
    box-shadow:
      ${parseDropShadow("drop-shadow-centered-lemon")},
      ${parseDropShadow("drop-shadow-centered-grey")};
    outline: none;
  }
`;

const TaskChevron = styled(OakIcon)<{ $isOpen: boolean }>`
  flex: 0 0 auto;
  transform: rotate(${({ $isOpen }) => ($isOpen ? "180deg" : "0deg")});
  transition: transform 0.2s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/** Content inside renders beneath a level 4 heading. */
export function TaskAccordion({
  children,
  title,
}: Readonly<{ children: ReactNode; title: InlineContent }>) {
  const [isOpen, setIsOpen] = useState(true);
  const id = useId();
  const toggleId = `${id}-task-toggle`;
  const panelId = `${id}-task-panel`;

  return (
    <OakBox $pt="spacing-24" as="section">
      <OakHeading $font="heading-5" $ma="spacing-0" tag="h4">
        <TaskToggle
          aria-controls={panelId}
          aria-expanded={isOpen}
          id={toggleId}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <InlineContentRenderer content={title} />
          <TaskChevron
            $height="spacing-24"
            $isOpen={isOpen}
            $width="spacing-24"
            alt=""
            aria-hidden="true"
            iconName="chevron-down"
          />
        </TaskToggle>
      </OakHeading>
      <OakFlex
        $display={isOpen ? "flex" : "none"}
        $flexDirection="column"
        $gap="spacing-32"
        $pt="spacing-32"
        aria-labelledby={toggleId}
        id={panelId}
        role="region"
      >
        {children}
      </OakFlex>
    </OakBox>
  );
}
