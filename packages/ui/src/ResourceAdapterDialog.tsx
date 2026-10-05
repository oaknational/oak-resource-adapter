"use client";

import { useEffect, useMemo, useRef } from "react";
import { OakModalCenter, OakModalCenterBody } from "@oaknational/oak-components";

import {
  createAnalyticsTracker,
  type ResourceAdapterAnalyticsHandler,
  type TrackAnalyticsEvent,
} from "./analytics.js";
import { capabilityWorkflows } from "./capabilities/workflowRegistry.js";
import {
  ResourceAdapterErrorBoundary,
  ResourceAdapterUnavailableMessage,
} from "./ResourceAdapterErrorBoundary.js";
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

/** `min-width: 0` lets wide worksheet content shrink inside the modal's flex row. */
const workflowContainerStyle = { minWidth: 0, width: "100%" } as const;

function ResourceAdapterDialogInner({
  apiBaseUrl,
  capability,
  getToken,
  isOpen,
  lesson,
  onClose,
  onError,
  resetKeys,
  track,
}: ResourceAdapterDialogInnerProps) {
  const Workflow = capabilityWorkflows[capability.id];
  const titleId = `resource-adapter-${capability.id}-title`;

  return (
    <OakModalCenter
      isOpen={isOpen}
      modalOuterFlexProps={{
        $pa: "spacing-12",
        style: { maxWidth: "min(97vw, 96rem)" },
      }}
      // The centred modal names nothing and calls itself an alert, neither of
      // which suits a worksheet a teacher reads. Both are overridable, and the
      // supplied style replaces the height cap it would otherwise set.
      modalFlexProps={{
        "aria-labelledby": titleId,
        role: "dialog",
        style: { maxHeight: "calc(100vh - 1.5rem)" },
      }}
      // Reserved gutter: a scrollbar appearing mid-workflow would reflow the
      // worksheet under the pointer.
      modalInnerFlexProps={{ style: { scrollbarGutter: "stable" } }}
      onClose={onClose}
    >
      <OakModalCenterBody
        // The body titles itself h1, which would be a second h1 on the host page.
        headingOverride={{ id: titleId, tag: "h2" }}
        iconName="ai"
        title={capability.label}
      >
        <div style={workflowContainerStyle}>
          <ResourceAdapterErrorBoundary
            {...(onError ? { onError } : {})}
            resetKeys={resetKeys}
          >
            <Workflow
              apiBaseUrl={apiBaseUrl}
              getToken={getToken}
              isOpen={isOpen}
              lesson={lesson}
              {...(onError ? { onError } : {})}
              track={track}
            />
          </ResourceAdapterErrorBoundary>
        </div>
      </OakModalCenterBody>
    </OakModalCenter>
  );
}
