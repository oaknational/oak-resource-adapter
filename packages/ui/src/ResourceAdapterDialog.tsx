"use client";

import { useEffect, useRef } from "react";
import {
  OakFlex,
  OakHeading,
  OakInformativeModal,
  OakInformativeModalBody,
  OakP,
  OakSecondaryButton,
} from "@oaknational/oak-components";

import {
  ResourceAdapterErrorBoundary,
  ResourceAdapterUnavailableMessage,
} from "./ResourceAdapterErrorBoundary.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterCapability,
  ResourceAdapterErrorHandler,
  ResourceAdapterReportingProps,
} from "./publicTypes.js";

export type ResourceAdapterDialogProps = Readonly<{
  capabilities: readonly ResourceAdapterCapability[];
  /** Enables reporting caught render failures to the API when set with `trpcEndpoint`. */
  getToken?: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onClose: () => void;
  /** Invoked with any caught render failure, for the host's own observability. */
  onError?: ResourceAdapterErrorHandler;
  trpcEndpoint?: string;
}>;

function toReporting(
  getToken: GetToken | undefined,
  trpcEndpoint: string | undefined,
): ResourceAdapterReportingProps | undefined {
  return getToken && trpcEndpoint ? { getToken, trpcEndpoint } : undefined;
}

/**
 * The package-owned adapter sidebar. Generation controls, progress, preview and
 * download flow will be added here without requiring OWA layout changes.
 *
 * Two error boundaries isolate it from the host page. The inner one wraps the
 * dialog content, so a content crash shows the unavailable state inside the
 * still-open modal, and closing or switching lesson resets it. The outer one
 * wraps the modal itself, so even a crash in the dialog shell cannot take down
 * the host page; its fallback renders inline at the mount point and takes
 * focus, because the modal's focus trap has just unmounted.
 */
export function ResourceAdapterDialog(props: ResourceAdapterDialogProps) {
  const { getToken, isOpen, lesson, onClose, onError, trpcEndpoint } = props;
  const reporting = toReporting(getToken, trpcEndpoint);

  return (
    <ResourceAdapterErrorBoundary
      fallback={({ onTryAgain }) =>
        isOpen ? (
          <ResourceAdapterDialogShellFallback
            onDismiss={onClose}
            onTryAgain={onTryAgain}
          />
        ) : null
      }
      {...(onError ? { onError } : {})}
      {...(reporting ? { reporting } : {})}
      resetKeys={[isOpen, lesson.lessonSlug]}
    >
      <ResourceAdapterDialogInner {...props} />
    </ResourceAdapterErrorBoundary>
  );
}

function ResourceAdapterDialogInner({
  capabilities,
  getToken,
  isOpen,
  lesson,
  onClose,
  onError,
  trpcEndpoint,
}: ResourceAdapterDialogProps) {
  const capability = capabilities[0];
  const reporting = toReporting(getToken, trpcEndpoint);

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
          {/*
            isOpen is a reset key because the modal only unmounts its children
            after the exit transition completes; an explicit reset on close is
            immediate and does not depend on animation timing.
          */}
          <ResourceAdapterErrorBoundary
            {...(onError ? { onError } : {})}
            {...(reporting ? { reporting } : {})}
            resetKeys={[isOpen, lesson.lessonSlug]}
          >
            <ResourceAdapterDialogContent capability={capability} lesson={lesson} />
          </ResourceAdapterErrorBoundary>
        </OakFlex>
      </OakInformativeModalBody>
    </OakInformativeModal>
  );
}

type ResourceAdapterDialogContentProps = Readonly<{
  capability: ResourceAdapterCapability | undefined;
  lesson: LessonContext;
}>;

/**
 * A component of its own (rather than inline JSX in the dialog body) so that
 * rendering it happens inside the inner error boundary: React elements are
 * created by the parent's render, so a crash in inline children would bypass
 * the boundary meant to catch it.
 */
function ResourceAdapterDialogContent({
  capability,
  lesson,
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
    </>
  );
}

type ResourceAdapterDialogShellFallbackProps = Readonly<{
  onDismiss: () => void;
  onTryAgain: () => void;
}>;

/**
 * Shown when the dialog shell itself crashes: the modal and its focus trap
 * have unmounted, so this renders inline where the dialog was mounted, takes
 * focus, and lets the teacher retry or dismiss (which tells the host to treat
 * the dialog as closed).
 */
function ResourceAdapterDialogShellFallback({
  onDismiss,
  onTryAgain,
}: ResourceAdapterDialogShellFallbackProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div
      aria-atomic="true"
      data-testid="resource-adapter-dialog-fallback"
      ref={containerRef}
      role="alert"
      tabIndex={-1}
    >
      <ResourceAdapterUnavailableMessage
        message="An unexpected problem closed this dialog. The rest of the page still works."
        onTryAgain={onTryAgain}
      />
      <OakFlex $mt="spacing-8">
        <OakSecondaryButton onClick={onDismiss}>Dismiss</OakSecondaryButton>
      </OakFlex>
    </div>
  );
}
