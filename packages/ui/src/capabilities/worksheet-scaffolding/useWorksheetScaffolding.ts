"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  supportLevels,
  type WorksheetScaffoldingApplyRequest,
  type WorksheetScaffoldingEntry,
  type WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";

import type { CapabilityAnalyticsEvent, TrackAnalyticsEvent } from "../../analytics.js";
import { reportToHost } from "../../errors.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterErrorHandler,
} from "../../publicTypes.js";
import { newRequestId } from "../../requestId.js";
import {
  acceptWorksheetScaffoldingReview,
  applyWorksheetScaffoldingSuggestion,
  getWorksheetScaffolding,
  openWorksheetScaffolding,
  enqueueWorksheetScaffoldingRemoval,
  retryWorksheetScaffoldingTransformation,
  enqueueWorksheetScaffoldingDismissal,
  undoWorksheetScaffoldingReview,
  retryWorksheetScaffoldingSuggestions,
} from "../../worksheetScaffolding.js";
import { useWorksheetScaffoldingPolling } from "./useWorksheetScaffoldingPolling.js";
import { jobIsBusy, workflowReducer, type WorkflowEvent } from "./workflowState.js";
import {
  createWorksheetAnalyticsTracker,
  transformationKinds,
} from "./worksheetAnalytics.js";

type OpenRequest = Readonly<{
  key: string;
  promise: Promise<WorksheetScaffoldingEntry>;
}>;

type ReplacementRequest = Readonly<{ adaptationId: string; requestId: string }>;

type Connection = Readonly<{ apiBaseUrl: string; getToken: GetToken }>;

type ScaffoldingAction =
  "accept" | "dismiss" | "remove" | "retrySuggestions" | "retryTransformation" | "undo";

type ComponentTypeFor<Name extends CapabilityAnalyticsEvent["name"]> = Extract<
  CapabilityAnalyticsEvent,
  { name: Name; componentType: string }
>["componentType"];

type Settled = Readonly<{
  onSucceeded?: (value: WorksheetScaffoldingState) => void;
  onFailed?: () => void;
}>;

function failedRequest(action: ScaffoldingAction) {
  if (action === "retrySuggestions") {
    return { requestAction: "retry", retryTarget: "suggestions" } as const;
  }
  if (action === "retryTransformation") {
    return { requestAction: "retry", retryTarget: "transformation" } as const;
  }
  return { requestAction: action };
}

const REVIEW_CONTROLS = {
  accept: "accept_button",
  retry: "retry_button",
  undo: "undo_button",
} as const;

function reviewDetails<Action extends keyof typeof REVIEW_CONTROLS>(
  { adaptationId, pendingReview }: WorksheetScaffoldingState,
  reviewAction: Action,
) {
  return pendingReview === null
    ? null
    : {
        adaptationId,
        componentType: REVIEW_CONTROLS[reviewAction],
        reviewAction,
        transformationKind: pendingReview.kind,
        ...(pendingReview.supportLevel === null
          ? {}
          : { supportLevel: pendingReview.supportLevel }),
      };
}

function reviewRequestedEvent(
  value: WorksheetScaffoldingState,
  reviewAction: keyof typeof REVIEW_CONTROLS,
): CapabilityAnalyticsEvent | null {
  const details = reviewDetails(value, reviewAction);
  return details && { name: "Transformation Review Requested", ...details };
}

function reviewedEvent(
  value: WorksheetScaffoldingState,
  reviewAction: "accept" | "undo",
): CapabilityAnalyticsEvent | null {
  const details = reviewDetails(value, reviewAction);
  return details && { name: "Transformation Reviewed", ...details };
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useWorksheetScaffolding({
  apiBaseUrl,
  getToken,
  isOpen,
  lesson,
  onError,
  track,
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onError?: ResourceAdapterErrorHandler;
  track: TrackAnalyticsEvent;
}>) {
  const [state, dispatchEvent] = useReducer(workflowReducer, { status: "idle" });
  const [openCount, setOpenCount] = useState(0);
  const openRequestRef = useRef<OpenRequest | null>(null);
  const replacingRef = useRef<ReplacementRequest | null>(null);
  // Responses from before the workflow last (re)opened are dropped.
  const sessionRef = useRef(0);
  // A refresh response is dropped if anything else changed state after it started.
  const revisionRef = useRef(0);
  const getTokenRef = useLatestRef(getToken);
  const lessonRef = useLatestRef(lesson);
  const onErrorRef = useLatestRef(onError);
  const trackRef = useLatestRef(track);
  const [analytics] = useState(() =>
    createWorksheetAnalyticsTracker((event) => trackRef.current(event)),
  );
  const lessonKey = JSON.stringify(lesson);

  const connection = useMemo<Connection>(
    () => ({ apiBaseUrl, getToken: () => getTokenRef.current() }),
    [apiBaseUrl, getTokenRef],
  );

  const dispatch = useCallback((event: WorkflowEvent) => {
    revisionRef.current += 1;
    dispatchEvent(event);
  }, []);

  const failWith = useCallback(
    (error: unknown) => {
      reportToHost(onErrorRef.current, error);
      dispatch({ type: "failed" });
    },
    [dispatch, onErrorRef],
  );

  const receive = useCallback(
    (value: WorksheetScaffoldingState) => dispatch({ type: "received", value }),
    [dispatch],
  );

  const fetchState = useCallback(
    (adaptationId: string) => getWorksheetScaffolding({ adaptationId, ...connection }),
    [connection],
  );

  const settle = useCallback(
    (
      request: Promise<WorksheetScaffoldingState>,
      type: "received" | "resumed",
      { onSucceeded, onFailed }: Settled = {},
    ) => {
      const session = sessionRef.current;
      void request.then(
        (value) => {
          if (sessionRef.current !== session) return;
          dispatch({ type, value });
          onSucceeded?.(value);
        },
        (error: unknown) => {
          if (sessionRef.current !== session) return;
          onFailed?.();
          failWith(error);
        },
      );
    },
    [dispatch, failWith],
  );

  useEffect(() => {
    let cancelled = false;
    sessionRef.current += 1;
    if (!isOpen) {
      analytics.resetDisplays();
      openRequestRef.current = null;
      replacingRef.current = null;
      dispatch({ type: "closed" });
      return;
    }

    dispatch({ type: "loading" });
    const replacing = replacingRef.current;
    const requestKey = `${connection.apiBaseUrl}:${lessonKey}:${openCount}:${replacing?.requestId ?? ""}`;
    const request =
      openRequestRef.current?.key === requestKey
        ? openRequestRef.current
        : {
            key: requestKey,
            promise: openWorksheetScaffolding({
              ...connection,
              lesson: lessonRef.current,
              ...(replacing === null ? {} : { replacing }),
            }),
          };
    openRequestRef.current = request;
    void request.promise.then(
      (entry) => {
        // The declined adaptation is abandoned once, so asking to replace it
        // again would be refused.
        replacingRef.current = null;
        if (cancelled) return;
        dispatch({ type: "opened", entry });
        if (entry.outcome === "opened") {
          trackRef.current({
            name: "Adaptation Started",
            componentType: "resource_adapter_dialog",
            adaptationId: entry.state.adaptationId,
            startMode: "new",
          });
        }
      },
      (error: unknown) => {
        if (cancelled) return;
        trackRef.current({
          name: "Adaptation Request Failed",
          componentType: "resource_adapter_dialog",
          requestAction: "open",
          ...(replacing === null ? {} : { adaptationId: replacing.adaptationId }),
        });
        failWith(error);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [
    analytics,
    connection,
    dispatch,
    failWith,
    isOpen,
    lessonKey,
    lessonRef,
    openCount,
    trackRef,
  ]);

  const ready = state.status === "ready" ? state : null;
  const adaptationId = ready?.value.adaptationId ?? null;
  const adaptationIdRef = useLatestRef(adaptationId);

  useEffect(() => {
    if (!isOpen || ready === null) return;
    analytics.observeJob(ready.value);
    if (ready.documentIsVisible) analytics.observeDisplay(ready.value);
  }, [analytics, isOpen, ready]);

  const pollFailed = useCallback(
    (error: unknown) => {
      const polled = adaptationIdRef.current;
      trackRef.current({
        name: "Adaptation Request Failed",
        componentType: "resource_adapter_dialog",
        requestAction: "poll",
        ...(polled === null ? {} : { adaptationId: polled }),
      });
      failWith(error);
    },
    [adaptationIdRef, failWith, trackRef],
  );

  useWorksheetScaffoldingPolling({
    adaptationId:
      isOpen &&
      ready !== null &&
      (jobIsBusy(ready.value) || ready.value.downloadAvailability === "busy")
        ? ready.value.adaptationId
        : null,
    jobId: ready?.value.job?.id ?? null,
    fetchState,
    onFetched: receive,
    onFailed: pollFailed,
  });

  const applySuggestion = useCallback(
    (suggestionId: string, params?: WorksheetScaffoldingApplyRequest["params"]) => {
      if (
        ready === null ||
        jobIsBusy(ready.value) ||
        ready.applyingSuggestion !== null
      ) {
        return;
      }
      const suggestion = ready.value.suggestions.find(
        (candidate) => candidate.id === suggestionId,
      );
      if (suggestion === undefined) {
        return;
      }
      const appliedAdaptationId = ready.value.adaptationId;
      const supportLevel = supportLevels.find(
        (level) => level === params?.supportLevel,
      );
      trackRef.current({
        name: "Transformation Requested",
        componentType: "suggestion_button",
        adaptationId: appliedAdaptationId,
        transformationKind: suggestion.kind,
        ...(supportLevel === undefined ? {} : { supportLevel }),
      });
      dispatch({ type: "applyStarted", suggestion });
      settle(
        applyWorksheetScaffoldingSuggestion({
          ...connection,
          adaptationId: appliedAdaptationId,
          ...(params === undefined ? {} : { params }),
          suggestionId,
        }),
        "received",
        {
          onFailed: () =>
            trackRef.current({
              name: "Adaptation Request Failed",
              componentType: "resource_adapter_dialog",
              requestAction: "apply",
              adaptationId: appliedAdaptationId,
            }),
        },
      );
    },
    [connection, dispatch, ready, settle, trackRef],
  );

  const resume = useCallback(
    (resumedAdaptationId: string) => {
      dispatch({ type: "loading" });
      settle(fetchState(resumedAdaptationId), "resumed", {
        onSucceeded: (value) => {
          analytics.ignoreHistoricalJob(value);
          trackRef.current({
            name: "Adaptation Started",
            componentType: "resource_adapter_dialog",
            adaptationId: value.adaptationId,
            startMode: "resumed",
          });
        },
        onFailed: () =>
          trackRef.current({
            name: "Adaptation Request Failed",
            componentType: "resource_adapter_dialog",
            requestAction: "resume",
            adaptationId: resumedAdaptationId,
          }),
      });
    },
    [analytics, dispatch, fetchState, settle, trackRef],
  );

  /**
   * One in-flight action at a time. `select` both guards the action and gathers
   * its request, so an action that no longer applies never reaches the API.
   */
  const runAction = useCallback(
    <TRequest>(
      action: ScaffoldingAction,
      select: (value: WorksheetScaffoldingState) => TRequest | null,
      request: (options: TRequest & Connection) => Promise<WorksheetScaffoldingState>,
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
      settle(request({ ...selected, ...connection }), "received", {
        onSucceeded: () => {
          if (succeeded !== null) trackRef.current(succeeded);
        },
        onFailed: () =>
          trackRef.current({
            name: "Adaptation Request Failed",
            componentType: "resource_adapter_dialog",
            ...failedRequest(action),
            adaptationId: actionAdaptationId,
          }),
      });
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

  const refresh = useCallback(async () => {
    if (adaptationId === null) return;
    const revision = ++revisionRef.current;
    try {
      const value = await fetchState(adaptationId);
      if (revision === revisionRef.current) dispatch({ type: "refreshed", value });
    } catch (error) {
      if (revision !== revisionRef.current) return;
      trackRef.current({
        name: "Adaptation Request Failed",
        componentType: "resource_adapter_dialog",
        requestAction: "refresh",
        adaptationId,
      });
      throw error;
    }
  }, [adaptationId, dispatch, fetchState, trackRef]);

  const reopen = useCallback((replacingAdaptationId: string | null) => {
    if (replacingAdaptationId !== null) {
      replacingRef.current = {
        adaptationId: replacingAdaptationId,
        requestId: newRequestId(),
      };
    }
    setOpenCount((count) => count + 1);
  }, []);

  const startFresh = useCallback(
    (
      replacedAdaptationId: string,
      componentType: ComponentTypeFor<"Adaptation Restart Requested">,
    ) => {
      trackRef.current({
        name: "Adaptation Restart Requested",
        componentType,
        adaptationId: replacedAdaptationId,
      });
      reopen(replacedAdaptationId);
    },
    [reopen, trackRef],
  );

  const tryAgain = useCallback(() => {
    if (ready?.value.job?.status === "failed") {
      startFresh(ready.value.adaptationId, "start_again_button");
    } else {
      reopen(null);
    }
  }, [ready, reopen, startFresh]);

  return {
    acceptReview,
    applySuggestion,
    dismissTarget,
    refresh,
    removeContribution,
    resume,
    retrySuggestions,
    retryTransformationReview,
    startFresh,
    state,
    tryAgain,
    undoReview,
  } as const;
}
