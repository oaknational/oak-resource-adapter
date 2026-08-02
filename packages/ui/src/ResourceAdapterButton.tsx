"use client";

import { OakPrimaryButton } from "@oaknational/oak-components";

import { ResourceAdapterErrorBoundary } from "./ResourceAdapterErrorBoundary.js";

export type ResourceAdapterButtonProps = Readonly<{
  onClick: () => void;
}>;

/**
 * The lesson-page trigger. OWA decides where to place it after it has resolved
 * the available capabilities for the current lesson and teacher.
 *
 * A render crash hides the trigger rather than reaching the host page. There
 * is nothing useful to show in its place, and no credentials are available
 * here to report with; the dialog carries the reporting wiring.
 */
export function ResourceAdapterButton({ onClick }: ResourceAdapterButtonProps) {
  return (
    <ResourceAdapterErrorBoundary fallback={() => null}>
      <OakPrimaryButton onClick={onClick}>Create more with AI</OakPrimaryButton>
    </ResourceAdapterErrorBoundary>
  );
}
