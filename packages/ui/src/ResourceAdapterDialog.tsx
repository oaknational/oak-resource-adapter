"use client";

import { useEffect, useRef, useState } from "react";

import {
  OakFlex,
  OakHeading,
  OakInformativeModal,
  OakInformativeModalBody,
  OakP,
} from "@oaknational/oak-components";

import { FeatureFlag } from "./FeatureFlag.js";
import { getResourceAdapterFeatureFlags } from "./getResourceAdapterFeatureFlags.js";
import { reportToHost } from "./errors.js";
import {
  ResourceAdapterErrorBoundary,
  ResourceAdapterUnavailableMessage,
} from "./ResourceAdapterErrorBoundary.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterCapability,
  ResourceAdapterErrorHandler,
  ResourceDocumentSummary,
} from "./publicTypes.js";

export type ResourceAdapterDialogProps = Readonly<{
  apiBaseUrl: string;
  capabilities: readonly ResourceAdapterCapability[];
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onClose: () => void;
  resourceDocumentSummary?: ResourceDocumentSummary | undefined;
  /** Invoked with any error the adapter catches, for the host's observability. */
  onError?: ResourceAdapterErrorHandler;
}>;

/**
 * The package-owned adapter sidebar. Generation controls, progress, preview and
 * download flow will be added here without requiring OWA layout changes.
 *
 * Two boundaries: the inner one keeps a content crash inside the still-open
 * modal, the outer one keeps a shell crash off the host page.
 */
export function ResourceAdapterDialog(props: ResourceAdapterDialogProps) {
  const { isOpen, lesson, onClose, onError, resourceDocumentSummary } = props;
  // isOpen resets on close without waiting for the modal's exit animation.
  const resetKeys = [isOpen, lesson.lessonSlug, resourceDocumentSummary?.id];

  return (
    <ResourceAdapterErrorBoundary
      fallback={({ onTryAgain }) =>
        isOpen ? (
          <ResourceAdapterUnavailableMessage
            focusOnMount={true}
            message="An unexpected problem closed this dialog. The rest of the page still works."
            onDismiss={onClose}
            onTryAgain={onTryAgain}
            testId="resource-adapter-dialog-fallback"
          />
        ) : null
      }
      {...(onError ? { onError } : {})}
      resetKeys={resetKeys}
    >
      <ResourceAdapterDialogInner {...props} resetKeys={resetKeys} />
    </ResourceAdapterErrorBoundary>
  );
}

type ResourceAdapterDialogInnerProps = ResourceAdapterDialogProps &
  Readonly<{ resetKeys: readonly unknown[] }>;

function ResourceAdapterDialogInner({
  apiBaseUrl,
  capabilities,
  getToken,
  isOpen,
  lesson,
  onClose,
  onError,
  resourceDocumentSummary,
  resetKeys,
}: ResourceAdapterDialogInnerProps) {
  const [enabledFlags, setEnabledFlags] = useState<readonly string[]>([]);
  const capability = capabilities[0];

  // A ref, so an inline host callback does not re-run the fetch below.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
      } catch (error) {
        reportToHost(onErrorRef.current, error);

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
          <ResourceAdapterErrorBoundary
            {...(onError ? { onError } : {})}
            resetKeys={resetKeys}
          >
            <ResourceAdapterDialogContent
              capability={capability}
              enabledFlags={enabledFlags}
              lesson={lesson}
              resourceDocumentSummary={resourceDocumentSummary}
            />
          </ResourceAdapterErrorBoundary>
        </OakFlex>
      </OakInformativeModalBody>
    </OakInformativeModal>
  );
}

type ResourceAdapterDialogContentProps = Readonly<{
  capability: ResourceAdapterCapability | undefined;
  enabledFlags: readonly string[];
  lesson: LessonContext;
  resourceDocumentSummary?: ResourceDocumentSummary | undefined;
}>;

/**
 * Its own component, not inline JSX, so it renders inside the inner boundary.
 * Inline children are created by the parent's render and would bypass it.
 */
function ResourceAdapterDialogContent({
  capability,
  enabledFlags,
  lesson,
  resourceDocumentSummary,
}: ResourceAdapterDialogContentProps) {
  return (
    <>
      <OakP>
        Hello, World! Resource Adapter is ready to adapt resources for{" "}
        <strong>{lesson.title}</strong>.
      </OakP>
      {capability && (
        <OakP>
          Available capability: <strong>{capability.label}</strong>.
        </OakP>
      )}
      {resourceDocumentSummary && (
        <OakP>
          Worksheet data loaded: <strong>{resourceDocumentSummary.title}</strong>. The
          document contains {resourceDocumentSummary.questionCount}{" "}
          {resourceDocumentSummary.questionCount === 1 ? "question" : "questions"}
          {" and "}
          {resourceDocumentSummary.diagnosticCount}{" "}
          {resourceDocumentSummary.diagnosticCount === 1
            ? "extraction diagnostic"
            : "extraction diagnostics"}
          , using schema {resourceDocumentSummary.schemaVersion}.
        </OakP>
      )}
      <FeatureFlag enabledFlags={enabledFlags} flag="feature-flags-smoke-test-enabled">
        <OakP>
          Feature flag <strong>feature-flags-smoke-test-enabled</strong> is enabled. New
          Resource Adapter UI can be rendered here.
        </OakP>
      </FeatureFlag>
    </>
  );
}
