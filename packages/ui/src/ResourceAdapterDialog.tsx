"use client";

import {
  OakFlex,
  OakHeading,
  OakInformativeModal,
  OakInformativeModalBody,
} from "@oaknational/oak-components";

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
  onClose: () => void;
  /** Invoked with any error the adapter catches, for the host's observability. */
  onError?: ResourceAdapterErrorHandler;
}>;

/**
 * The package-owned adapter sidebar. Each selected capability owns its workflow
 * while this shell owns focus management, dismissal and crash containment.
 */
export function ResourceAdapterDialog(props: ResourceAdapterDialogProps) {
  const { capability, isOpen, lesson, onClose, onError } = props;
  const resetKeys = [isOpen, lesson.lessonSlug, capability.id];

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
  capability,
  getToken,
  isOpen,
  lesson,
  onClose,
  onError,
  resetKeys,
}: ResourceAdapterDialogInnerProps) {
  const Workflow = capabilityWorkflows[capability.id];
  const titleId = `resource-adapter-${capability.id}-title`;

  return (
    <OakInformativeModal
      aria-labelledby={titleId}
      closeOnBackgroundClick={true}
      isLeftHandSide={false}
      isOpen={isOpen}
      largeScreenMaxWidth={720}
      onClose={onClose}
    >
      <OakInformativeModalBody>
        <OakFlex $flexDirection="column" $gap="spacing-16">
          <OakHeading $font="heading-4" id={titleId} tag="h2">
            {capability.label}
          </OakHeading>
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
            />
          </ResourceAdapterErrorBoundary>
        </OakFlex>
      </OakInformativeModalBody>
    </OakInformativeModal>
  );
}
