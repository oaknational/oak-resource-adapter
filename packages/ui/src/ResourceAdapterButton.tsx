"use client";

import { OakPrimaryButton } from "@oaknational/oak-components";

export type ResourceAdapterButtonProps = Readonly<{
  onClick: () => void;
}>;

/**
 * The lesson-page trigger. OWA decides where to place it after it has resolved
 * the available capabilities for the current lesson and teacher.
 */
export function ResourceAdapterButton({ onClick }: ResourceAdapterButtonProps) {
  return <OakPrimaryButton onClick={onClick}>Create more with AI</OakPrimaryButton>;
}
