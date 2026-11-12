"use client";

import type { ReactNode } from "react";
import {
  OakFlex,
  OakHeading,
  OakIcon,
  OakLink,
  OakP,
  type OakIconName,
} from "@oaknational/oak-components";

import { VisibleLoadingSpinner } from "./styles.js";
import type { WorkflowStatus } from "./workflowStatus.js";

function StatusLine({ status }: Readonly<{ status: WorkflowStatus }>) {
  return (
    <OakFlex $alignItems="flex-start" $gap="spacing-8">
      {status.tone === "working" && (
        <VisibleLoadingSpinner
          aria-hidden="true"
          data-testid="worksheet-scaffolding-loading-spinner"
        />
      )}
      {status.tone === "warning" && (
        <OakIcon $height="spacing-24" $width="spacing-24" iconName="warning" />
      )}
      <OakFlex $flexDirection="column" $gap="spacing-4">
        {status.title !== undefined && <OakP $font="body-2-bold">{status.title}</OakP>}
        <OakP $font="body-2">{status.message}</OakP>
      </OakFlex>
    </OakFlex>
  );
}

export function SummaryAction({
  children,
  disabled,
  iconName,
  onClick,
}: Readonly<{
  children: string;
  disabled: boolean;
  iconName: OakIconName;
  onClick: () => void;
}>) {
  return (
    <OakLink
      $font="body-3"
      color="text-subdued"
      disabled={disabled}
      element="button"
      iconName={iconName}
      onClick={onClick}
      type="button"
      variant="secondary"
    >
      {children}
    </OakLink>
  );
}

export function SummaryPanel({
  actions,
  download,
  heading,
  status,
}: Readonly<{
  actions: ReactNode;
  download: ReactNode;
  heading: string;
  status: WorkflowStatus | null;
}>) {
  return (
    <OakFlex
      $background="bg-decorative3-very-subdued"
      $ba="border-solid-s"
      $borderColor="border-decorative3-stronger"
      $borderRadius="border-radius-m2"
      $flexDirection="column"
      $gap="spacing-16"
      $pa="spacing-24"
      data-testid="worksheet-scaffolding-summary"
    >
      <OakHeading $font="heading-6" tag="h3">
        {heading}
      </OakHeading>
      {status !== null && <StatusLine status={status} />}
      {actions !== null && (
        <OakFlex $flexWrap="wrap" $gap="spacing-16">
          {actions}
        </OakFlex>
      )}
      {download}
    </OakFlex>
  );
}
