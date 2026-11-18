"use client";

import { useEffect, useMemo, useRef } from "react";
import { OakFlex, OakHeading, OakIcon, OakModal } from "@oaknational/oak-components";

import {
  createAnalyticsTracker,
  type ResourceAdapterAnalyticsHandler,
  type TrackAnalyticsEvent,
} from "./analytics.js";
import { capabilityWorkflows } from "./capabilities/workflowRegistry.js";
import { DialogLoading } from "./DialogLoading.js";
import {
  ResourceAdapterErrorBoundary,
  ResourceAdapterUnavailableMessage,
} from "./ResourceAdapterErrorBoundary.js";
import { TermsView } from "./TermsView.js";
import { useTermsGate } from "./useTermsGate.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterCapability,
  ResourceAdapterErrorHandler,
} from "./publicTypes.js";

export type ResourceAdapterDialogProps = Readonly<{
  apiBaseUrl: string;
  capability: ResourceAdapterCapability;
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onAnalyticsEvent?: ResourceAdapterAnalyticsHandler;
  onClose: () => void;
  /** Invoked with any error the adapter catches, for the host's observability. */
  onError?: ResourceAdapterErrorHandler;
  /** Must send the teacher to onboarding and back to this lesson. */
  onFinishSetup: () => void;
}>;

/**
 * The package-owned full-screen modal. Each selected capability owns its workflow
 * while this shell owns focus management, dismissal and crash containment.
 */
export function ResourceAdapterDialog(props: ResourceAdapterDialogProps) {
  const { capability, isOpen, lesson, onAnalyticsEvent, onClose, onError } = props;
  const resetKeys = [isOpen, lesson.lessonSlug, capability.id];
  // Hosts pass inline callbacks, so the tracker reads the latest ones instead of
  // being rebuilt, and re-rendering the workflow, on every host render.
  const handlers = useRef({ onAnalyticsEvent, onError });
  useEffect(() => {
    handlers.current = { onAnalyticsEvent, onError };
  });
  const track = useMemo(
    () =>
      createAnalyticsTracker(
        capability.id,
        (event) => handlers.current.onAnalyticsEvent?.(event),
        (error, info) => handlers.current.onError?.(error, info),
      ),
    [capability.id],
  );
  const closeDialog = () => {
    track({
      name: "Resource Adapter Closed",
      componentType: "resource_adapter_dialog",
    });
    onClose();
  };

  return (
    <ResourceAdapterErrorBoundary
      fallback={({ onTryAgain }) =>
        isOpen ? (
          <ResourceAdapterUnavailableMessage
            focusOnMount={true}
            message="An unexpected problem closed this dialog. The rest of the page still works."
            onDismiss={closeDialog}
            onTryAgain={onTryAgain}
            testId="resource-adapter-dialog-fallback"
          />
        ) : null
      }
      {...(onError ? { onError } : {})}
      resetKeys={resetKeys}
    >
      <ResourceAdapterDialogInner
        {...props}
        onClose={closeDialog}
        resetKeys={resetKeys}
        track={track}
      />
    </ResourceAdapterErrorBoundary>
  );
}

type ResourceAdapterDialogInnerProps = ResourceAdapterDialogProps &
  Readonly<{ resetKeys: readonly unknown[]; track: TrackAnalyticsEvent }>;

// No Oak tokens for these. OakModal's content box only grows to fit its children,
// so the min-height fills the rest of the screen for a DialogNotice to centre in:
// 4rem header, 1px border and 3.5rem padding above and below. Remove the
// min-height with ADAPT-231.
const workflowContainerStyle = {
  maxWidth: "96rem",
  minHeight: "calc(100dvh - 11rem - 1px)",
} as const;

function ResourceAdapterDialogInner({
  apiBaseUrl,
  capability,
  getToken,
  isOpen,
  lesson,
  onClose,
  onError,
  onFinishSetup,
  resetKeys,
  track,
}: ResourceAdapterDialogInnerProps) {
  const Workflow = capabilityWorkflows[capability.id];
  const titleId = `resource-adapter-${capability.id}-title`;
  const terms = useTermsGate({ apiBaseUrl, getToken, isOpen, onError });

  return (
    <OakModal
      aria-labelledby={titleId}
      headerSlot={
        <OakFlex $alignItems="center" $gap="spacing-8">
          <OakIcon $colorFilter="icon-inverted" iconName="ai" />
          <OakHeading $font="heading-light-7" id={titleId} tag="h2">
            Aila | Oak&apos;s AI
          </OakHeading>
        </OakFlex>
      }
      headerVariant="inverted"
      isOpen={isOpen}
      onClose={onClose}
      position="fullscreen"
    >
      <OakFlex
        $flexDirection="column"
        $mh="auto"
        $width="100%"
        style={workflowContainerStyle}
      >
        <ResourceAdapterErrorBoundary
          {...(onError ? { onError } : {})}
          resetKeys={resetKeys}
        >
          {terms.status === "checking" && <DialogLoading heading="Loading…" />}
          {terms.status === "checkFailed" && (
            <ResourceAdapterUnavailableMessage
              message="We couldn't check your account. The rest of the page still works."
              onTryAgain={terms.retry}
              testId="resource-adapter-terms-error"
            />
          )}
          {(terms.status === "required" ||
            terms.status === "accepting" ||
            terms.status === "acceptFailed" ||
            terms.status === "outdated") && (
            <TermsView
              isAccepting={terms.status === "accepting"}
              onAccept={terms.accept}
              onBack={onClose}
              problem={
                terms.status === "acceptFailed" || terms.status === "outdated"
                  ? terms.status
                  : null
              }
            />
          )}
          {terms.status === "accepted" && (
            <Workflow
              apiBaseUrl={apiBaseUrl}
              getToken={getToken}
              isOpen={isOpen}
              lesson={lesson}
              onClose={onClose}
              {...(onError ? { onError } : {})}
              onFinishSetup={onFinishSetup}
              onTermsRequired={terms.require}
              track={track}
            />
          )}
        </ResourceAdapterErrorBoundary>
      </OakFlex>
    </OakModal>
  );
}
