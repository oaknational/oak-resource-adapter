"use client";

import { useCallback } from "react";
import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";

import type { CapabilityAnalyticsEvent, TrackAnalyticsEvent } from "../../analytics.js";
import type { CreateResourceAdapterClientOptions } from "../../client.js";
import { newRequestId } from "../../requestId.js";
import {
  acceptWorksheetScaffoldingReview,
  enqueueWorksheetScaffoldingDismissal,
  enqueueWorksheetScaffoldingRemoval,
  retryWorksheetScaffoldingSuggestions,
  retryWorksheetScaffoldingTransformation,
  undoWorksheetScaffoldingReview,
} from "../../worksheetScaffolding.js";
import { jobIsBusy, type ReadyWorkflow, type WorkflowEvent } from "./workflowState.js";
import {
  requestFor,
  reviewedEvent,
  reviewRequestedEvent,
  transformationKinds,
  type ComponentTypeFor,
  type ScaffoldingAction,
  type TrackedRequest,
} from "./worksheetAnalytics.js";

export function useWorksheetScaffoldingActions({
  connection,
  dispatch,
  ready,
  settle,
  trackRef,
}: Readonly<{
  connection: CreateResourceAdapterClientOptions;
  dispatch: (event: WorkflowEvent) => void;
  ready: ReadyWorkflow | null;
  settle: (
    response: Promise<WorksheetScaffoldingState>,
    request: TrackedRequest,
    onSucceeded?: (value: WorksheetScaffoldingState) => void,
  ) => void;
  trackRef: Readonly<{ current: TrackAnalyticsEvent }>;
}>) {
  /**
   * One in-flight action at a time. `select` both guards the action and gathers
   * its request, so an action that no longer applies never reaches the API.
   */
  const runAction = useCallback(
    <TRequest>(
      action: ScaffoldingAction,
      select: (value: WorksheetScaffoldingState) => TRequest | null,
      request: (
        options: TRequest & CreateResourceAdapterClientOptions,
      ) => Promise<WorksheetScaffoldingState>,
      requestedEvent: (
        value: WorksheetScaffoldingState,
      ) => CapabilityAnalyticsEvent | null,
      succeededEvent?: (
        value: WorksheetScaffoldingState,
      ) => CapabilityAnalyticsEvent | null,
    ) => {
      if (ready === null || jobIsBusy(ready.value) || ready.actionIsPending) {
        return;
      }
      const selected = select(ready.value);
      if (selected === null) {
        return;
      }
      const requested = requestedEvent(ready.value);
      if (requested !== null) trackRef.current(requested);
      // Built before the request, because the response clears the review it describes.
      const succeeded = succeededEvent?.(ready.value) ?? null;
      const actionAdaptationId = ready.value.adaptationId;
      dispatch({ type: "actionStarted" });
      settle(
        request({ ...selected, ...connection }),
        { ...requestFor(action), adaptationId: actionAdaptationId },
        () => {
          if (succeeded !== null) trackRef.current(succeeded);
        },
      );
    },
    [connection, dispatch, ready, settle, trackRef],
  );

  const runReviewAction = useCallback(
    (action: "accept" | "undo", request: typeof acceptWorksheetScaffoldingReview) =>
      runAction(
        action,
        ({ adaptationId, pendingReview }) =>
          pendingReview === null
            ? null
            : { adaptationId, attemptId: pendingReview.attemptId },
        request,
        (value) => reviewRequestedEvent(value, action),
        (value) => reviewedEvent(value, action),
      ),
    [runAction],
  );

  const acceptReview = useCallback(
    () => runReviewAction("accept", acceptWorksheetScaffoldingReview),
    [runReviewAction],
  );

  const undoReview = useCallback(
    () => runReviewAction("undo", undoWorksheetScaffoldingReview),
    [runReviewAction],
  );

  const retrySuggestions = useCallback(
    (componentType: ComponentTypeFor<"New Suggestions Requested">) =>
      runAction(
        "retrySuggestions",
        ({ adaptationId }) => ({ adaptationId, requestId: newRequestId() }),
        retryWorksheetScaffoldingSuggestions,
        ({ adaptationId }) => ({
          name: "New Suggestions Requested",
          componentType,
          adaptationId,
        }),
      ),
    [runAction],
  );

  const retryTransformationReview = useCallback(
    () =>
      runAction(
        "retryTransformation",
        ({ adaptationId, pendingReview }) =>
          pendingReview === null
            ? null
            : {
                adaptationId,
                attemptId: pendingReview.attemptId,
                requestId: newRequestId(),
              },
        retryWorksheetScaffoldingTransformation,
        (value) => reviewRequestedEvent(value, "retry"),
      ),
    [runAction],
  );

  /** Reruns a scaffold that moderation withheld or whose job failed. */
  const retryAttempt = useCallback(
    (attemptId: string) =>
      runAction(
        "retryTransformation",
        ({ adaptationId, pendingReview }) =>
          pendingReview === null
            ? { adaptationId, attemptId, requestId: newRequestId() }
            : null,
        retryWorksheetScaffoldingTransformation,
        () => null,
      ),
    [runAction],
  );

  const dismissTarget = useCallback(
    (targetBlockId: string | null) =>
      runAction(
        "dismiss",
        ({ adaptationId }) => ({ adaptationId, targetBlockId }),
        enqueueWorksheetScaffoldingDismissal,
        ({ adaptationId, suggestions }) => ({
          name: "Suggestion Dismissal Requested",
          componentType: "no_scaffold_required_button",
          adaptationId,
          transformationKinds: transformationKinds(
            suggestions.filter(
              (suggestion) => suggestion.targetBlockId === targetBlockId,
            ),
          ),
        }),
      ),
    [runAction],
  );

  const removeContribution = useCallback(
    (contributionId: string) =>
      runAction(
        "remove",
        ({ adaptationId, pendingReview }) =>
          pendingReview === null ? { adaptationId, contributionId } : null,
        enqueueWorksheetScaffoldingRemoval,
        ({ adaptationId }) => ({
          name: "Transformation Removal Requested",
          componentType: "remove_scaffold_button",
          adaptationId,
        }),
      ),
    [runAction],
  );

  return {
    acceptReview,
    dismissTarget,
    removeContribution,
    retryAttempt,
    retrySuggestions,
    retryTransformationReview,
    undoReview,
  } as const;
}
