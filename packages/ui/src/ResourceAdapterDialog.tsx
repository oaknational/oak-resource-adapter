"use client";

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
  // isOpen is a reset key because the modal only unmounts its children after
  // the exit transition completes; an explicit reset on close is immediate and
  // does not depend on animation timing. Both boundaries share the keys.
  const resetKeys = [isOpen, lesson.lessonSlug];

  return (
    <ResourceAdapterErrorBoundary
      fallback={({ onTryAgain }) =>
        isOpen ? (
          <ResourceAdapterUnavailableMessage
            extraAction={
              <OakSecondaryButton onClick={onClose}>Dismiss</OakSecondaryButton>
            }
            focusOnMount={true}
            message="An unexpected problem closed this dialog. The rest of the page still works."
            onTryAgain={onTryAgain}
            testId="resource-adapter-dialog-fallback"
          />
        ) : null
      }
      {...(onError ? { onError } : {})}
      {...(reporting ? { reporting } : {})}
      resetKeys={resetKeys}
    >
      <ResourceAdapterDialogInner
        {...props}
        reporting={reporting}
        resetKeys={resetKeys}
      />
    </ResourceAdapterErrorBoundary>
  );
}

type ResourceAdapterDialogInnerProps = ResourceAdapterDialogProps &
  Readonly<{
    reporting: ResourceAdapterReportingProps | undefined;
    resetKeys: readonly unknown[];
  }>;

function ResourceAdapterDialogInner({
  capabilities,
  isOpen,
  lesson,
  onClose,
  onError,
  reporting,
  resetKeys,
}: ResourceAdapterDialogInnerProps) {
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
          <ResourceAdapterErrorBoundary
            {...(onError ? { onError } : {})}
            {...(reporting ? { reporting } : {})}
            resetKeys={resetKeys}
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
