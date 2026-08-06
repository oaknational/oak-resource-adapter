"use client";

import { useEffect, useState } from "react";

import {
  OakFlex,
  OakHeading,
  OakInformativeModal,
  OakInformativeModalBody,
  OakP,
} from "@oaknational/oak-components";

import { FeatureFlag } from "./FeatureFlag.js";
import { getResourceAdapterFeatureFlags } from "./getResourceAdapterFeatureFlags.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterCapability,
} from "./publicTypes.js";

export type ResourceAdapterDialogProps = Readonly<{
  apiBaseUrl: string;
  capabilities: readonly ResourceAdapterCapability[];
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onClose: () => void;
}>;

/**
 * The package-owned adapter sidebar. Generation controls, progress, preview and
 * download flow will be added here without requiring OWA layout changes.
 */
export function ResourceAdapterDialog({
  apiBaseUrl,
  capabilities,
  getToken,
  isOpen,
  lesson,
  onClose,
}: ResourceAdapterDialogProps) {
  const [enabledFlags, setEnabledFlags] = useState<readonly string[]>([]);
  const capability = capabilities[0];

  useEffect(() => {
    let canceled = false;

    async function loadFlags() {
      if (!isOpen) {
        setEnabledFlags([]);
        return;
      }

      try {
        const flags = await getResourceAdapterFeatureFlags({
          apiBaseUrl,
          getToken,
        });
        if (!canceled) {
          setEnabledFlags(flags);
        }
      } catch {
        if (!canceled) {
          setEnabledFlags([]);
        }
      }
    }

    void loadFlags();

    return () => {
      canceled = true;
    };
  }, [apiBaseUrl, getToken, isOpen]);

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
