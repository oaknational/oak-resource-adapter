"use client";

import {
  OakFlex,
  OakHeading,
  OakInformativeModal,
  OakInformativeModalBody,
  OakP,
} from "@oaknational/oak-components";

import type { LessonContext, ResourceAdapterCapability } from "./publicTypes.js";

export type ResourceAdapterDialogProps = Readonly<{
  capabilities: readonly ResourceAdapterCapability[];
  isOpen: boolean;
  lesson: LessonContext;
  onClose: () => void;
}>;

/**
 * The package-owned adapter sidebar. Generation controls, progress, preview and
 * download flow will be added here without requiring OWA layout changes.
 */
export function ResourceAdapterDialog({
  capabilities,
  isOpen,
  lesson,
  onClose,
}: ResourceAdapterDialogProps) {
  const capability = capabilities[0];

  return (
    <OakInformativeModal
      aria-label="Create more with Aila"
      closeOnBackgroundClick={true}
      isLeftHandSide={false}
      isOpen={isOpen}
      largeScreenMaxWidth={720}
      onClose={onClose}
    >
      <OakInformativeModalBody>
        <OakFlex $flexDirection="column" $gap="spacing-16">
          <OakHeading $font="heading-4" tag="h2">
            Create more with Aila
          </OakHeading>
          <OakP>
            Hello, World! Resource Adapter is ready to adapt resources for{" "}
            <strong>{lesson.title}</strong>.
          </OakP>
          {capability && (
            <OakP>
              Available capability: <strong>{capability.label}</strong>.
            </OakP>
          )}
        </OakFlex>
      </OakInformativeModalBody>
    </OakInformativeModal>
  );
}
