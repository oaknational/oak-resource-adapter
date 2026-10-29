"use client";

import { useId, useState, type ReactNode } from "react";
import type { InlineContent } from "@oaknational/resource-document";
import { OakIcon, parseColor, parseDropShadow } from "@oaknational/oak-components";
import { styled } from "styled-components";

import { InlineContentRenderer } from "./InlineContentRenderer.js";

const TaskGroup = styled.section`
  border: 1px solid ${parseColor("border-neutral-lighter")};
  border-radius: 0.5rem;
  overflow: hidden;
`;

const TaskHeading = styled.h4`
  && {
    margin: 0;
  }
`;

const TaskToggle = styled.button`
  align-items: center;
  background: ${parseColor("bg-neutral")};
  border: 0;
  color: ${parseColor("text-primary")};
  cursor: pointer;
  display: flex;
  font: inherit;
  font-weight: 700;
  gap: 1rem;
  justify-content: space-between;
  min-height: 3rem;
  padding: 1rem;
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

const TaskContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;

  /* Out-specifies the UA sheet, which this display declaration would beat. */
  &[hidden] {
    display: none;
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
    <TaskGroup>
      <TaskHeading>
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
      </TaskHeading>
      <TaskContent
        aria-labelledby={toggleId}
        hidden={!isOpen}
        id={panelId}
        role="region"
      >
        {children}
      </TaskContent>
    </TaskGroup>
  );
}
