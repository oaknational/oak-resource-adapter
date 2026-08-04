"use client";

import {
  OakFlex,
  OakHeading,
  OakInformativeModal,
  OakInformativeModalBody,
  OakP,
} from "@oaknational/oak-components";

import { FeatureFlag } from "./FeatureFlag.js";
import type {
  FeatureFlagKey,
  LessonContext,
  ResourceAdapterCapability,
} from "./publicTypes.js";

export type ResourceAdapterDialogProps = Readonly<{
  capabilities: readonly ResourceAdapterCapability[];
  enabledFlags?: readonly FeatureFlagKey[];
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
  enabledFlags,
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
          <FeatureFlag
            enabledFlags={enabledFlags ?? []}
            flag="feature-flags-smoke-test-enabled"
          >
            <OakP>
              Feature flag <strong>feature-flags-smoke-test-enabled</strong> is enabled.
              New Resource Adapter UI can be rendered here.
            </OakP>
          </FeatureFlag>
        </OakFlex>
      </OakInformativeModalBody>
    </OakInformativeModal>
  );
}
