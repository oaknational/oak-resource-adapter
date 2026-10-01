"use client";

import type { ReactNode } from "react";
import {
  OakFlex,
  OakHeading,
  OakInlineBanner,
  OakP,
} from "@oaknational/oak-components";
import { styled } from "styled-components";

import { VisibleLoadingSpinner } from "./styles.js";
import type { WorkflowStatus } from "./workflowStatus.js";

export const StickyWorkflowStatus = styled.div`
  position: sticky;
  top: 0;
  z-index: 1;

  &:focus {
    outline: none;
  }
`;

const StatusAnnouncement = styled.span`
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
`;

function WorkflowAnnouncement({ status }: Readonly<{ status: WorkflowStatus | null }>) {
  return (
    <StatusAnnouncement
      aria-label="Worksheet status"
      aria-atomic="true"
      aria-live="polite"
      role="status"
    >
      {status === null
        ? ""
        : [status.title, status.message]
            .filter((part) => part !== undefined)
            .join(". ")}
    </StatusAnnouncement>
  );
}

/**
 * A region mounted alongside its own text is announced unreliably, whereas changing
 * the text of a mounted region is not. Every workflow state renders through this
 * frame, so the region keeps its place in the tree as the state changes.
 */
export function WorkflowFrame({
  children,
  status,
}: Readonly<{ children: ReactNode; status: WorkflowStatus | null }>) {
  return (
    <OakFlex $flexDirection="column" $gap="spacing-16">
      <WorkflowAnnouncement status={status} />
      {children}
    </OakFlex>
  );
}

export function LoadingStatusBanner({
  message,
  title,
}: Readonly<{ message: string; title: string }>) {
  return (
    <OakFlex
      $alignItems="flex-start"
      $background="bg-decorative3-very-subdued"
      $ba="border-solid-s"
      $borderColor="border-decorative3"
      $borderRadius="border-radius-m"
      $gap="spacing-12"
      $pa="spacing-16"
    >
      <OakFlex
        $alignItems="center"
        $flexShrink={0}
        $height="spacing-32"
        $justifyContent="center"
        $width="spacing-32"
        aria-hidden="true"
      >
        <VisibleLoadingSpinner data-testid="worksheet-scaffolding-loading-spinner" />
      </OakFlex>
      <OakFlex $flexDirection="column" $gap="spacing-4" $width="100%">
        <OakHeading $font="heading-7" tag="h3">
          {title}
        </OakHeading>
        <OakP $font="body-2">{message}</OakP>
      </OakFlex>
    </OakFlex>
  );
}

export function WorkflowStatusBanner({
  cta,
  status,
}: Readonly<{ cta: ReactNode; status: WorkflowStatus }>) {
  if (status.tone === "working") {
    return (
      <LoadingStatusBanner message={status.message} title={status.title ?? "Working"} />
    );
  }

  return (
    <OakInlineBanner
      isOpen
      cta={cta}
      icon="ai"
      message={status.message}
      {...(status.title === undefined ? {} : { title: status.title })}
      titleTag="h3"
      type={status.tone}
      variant="regular"
    />
  );
}
