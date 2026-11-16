"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  supportLevels,
  type WorksheetScaffoldingApplyRequest,
  type WorksheetScaffoldingEntry,
  type WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";

import { scheduleAt } from "../../scheduleAt.js";
import type {
  AdaptationRequest,
  CapabilityAnalyticsEvent,
  TrackAnalyticsEvent,
} from "../../analytics.js";
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

function openAction(lessonKey: string, replacing: ReplacementRequest | null): string {
  return `${lessonKey}:${replacing?.requestId ?? ""}`;
}

type Connection = Readonly<{ apiBaseUrl: string; getToken: GetToken }>;

type ScaffoldingAction =
  "accept" | "dismiss" | "remove" | "retrySuggestions" | "retryTransformation" | "undo";

type ComponentTypeFor<Name extends CapabilityAnalyticsEvent["name"]> = Extract<
  CapabilityAnalyticsEvent,
  { name: Name; componentType: string }
>["componentType"];

type TrackedRequest = AdaptationRequest & Readonly<{ adaptationId: string }>;

function requestFor(action: ScaffoldingAction): AdaptationRequest {
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
  onTermsRequired,
  track,
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onError?: ResourceAdapterErrorHandler;
  onTermsRequired: () => void;
  track: TrackAnalyticsEvent;
}>) {
  const [state, dispatchEvent] = useReducer(workflowReducer, { status: "idle" });
  const [openCount, setOpenCount] = useState(0);
  const openRequestRef = useRef<OpenRequest | null>(null);
  const replacingRef = useRef<ReplacementRequest | null>(null);
  // The open the teacher agreed to spend on. Retries of it stay confirmed; no
  // other lesson or replacement inherits it.
  const spendConfirmedForRef = useRef<string | null>(null);
  // Responses from before the workflow last (re)opened are dropped.
  const sessionRef = useRef(0);
  // A refresh response is dropped if anything else changed state after it started.
  const revisionRef = useRef(0);
  const getTokenRef = useLatestRef(getToken);
  const lessonRef = useLatestRef(lesson);
  const onErrorRef = useLatestRef(onError);
  const onTermsRequiredRef = useLatestRef(onTermsRequired);
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

  const receivePolled = useCallback(
    (value: WorksheetScaffoldingState) => {
      dispatch({ type: "received", value });
      analytics.observeUsageLimit(value.modelWorkBlocked, {
        adaptationId: value.adaptationId,
        requestAction: "poll",
      });
    },
    [analytics, dispatch],
  );

  const fetchState = useCallback(
    (adaptationId: string) => getWorksheetScaffolding({ adaptationId, ...connection }),
    [connection],
  );

  const settle = useCallback(
    (
      response: Promise<WorksheetScaffoldingState>,
      request: TrackedRequest,
      onSucceeded?: (value: WorksheetScaffoldingState) => void,
    ) => {
      const session = sessionRef.current;
      void response.then(
        (value) => {
          if (sessionRef.current !== session) return;
          dispatch({ type: "received", value });
          onSucceeded?.(value);
          analytics.observeUsageLimit(value.modelWorkBlocked, request);
        },
        (error: unknown) => {
          if (sessionRef.current !== session) return;
          trackRef.current({
            name: "Adaptation Request Failed",
            componentType: "resource_adapter_dialog",
            ...request,
          });
          failWith(error);
        },
      );
    },
    [analytics, dispatch, failWith, trackRef],
  );

  useEffect(() => {
    let cancelled = false;
    sessionRef.current += 1;
    if (!isOpen) {
      analytics.resetDisplays();
      openRequestRef.current = null;
      replacingRef.current = null;
      spendConfirmedForRef.current = null;
      dispatch({ type: "closed" });
      return;
    }

    dispatch({ type: "loading" });
    const replacing = replacingRef.current;
    const action = openAction(lessonKey, replacing);
    const spendConfirmed = spendConfirmedForRef.current === action;
    const requestKey = `${connection.apiBaseUrl}:${action}:${openCount}:${spendConfirmed}`;
    const request =
      openRequestRef.current?.key === requestKey
        ? openRequestRef.current
        : {
            key: requestKey,
            promise: openWorksheetScaffolding({
              ...connection,
              lesson: lessonRef.current,
              ...(replacing === null ? {} : { replacing }),
              spendConfirmed,
            }),
          };
    openRequestRef.current = request;
    void request.promise.then(
      (entry) => {
        if (entry.outcome !== "needsSpendConfirmation") {
          if (replacingRef.current === replacing) replacingRef.current = null;
          if (spendConfirmedForRef.current === action)
            spendConfirmedForRef.current = null;
        }
        if (cancelled) return;
        if (entry.outcome === "needsTerms") {
          onTermsRequiredRef.current();
          return;
        }
        dispatch({ type: "opened", entry });
        if (
          entry.outcome === "needsSpendConfirmation" ||
          entry.outcome === "usageLimitReached"
        ) {
          analytics.observeAllowance(entry.allowance);
        }
        if (entry.outcome === "opened" || entry.outcome === "reopened") {
          const { adaptationId: openedAdaptationId, modelWorkBlocked } = entry.state;
          trackRef.current({
            name: "Adaptation Started",
            componentType: "resource_adapter_dialog",
            adaptationId: openedAdaptationId,
            accessTier: entry.allowance.tier,
            startMode: entry.outcome === "opened" ? "new" : "reopened",
          });
          analytics.observeUsageLimit(modelWorkBlocked, {
            adaptationId: openedAdaptationId,
            requestAction: "open",
          });
        }
        if (entry.outcome === "usageLimitReached") {
          analytics.observeUsageLimit(entry.usageLimit, {
            requestAction: "open",
            ...(replacing === null ? {} : { adaptationId: replacing.adaptationId }),
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
  const retryAt = ready?.value.modelWorkBlocked?.retryAt ?? null;

  // A refused worksheet isn't polled, so this is what lifts the refusal at `retryAt`.
  useEffect(() => {
    if (retryAt === null) return;
    return scheduleAt(Date.parse(retryAt), () => dispatch({ type: "refusalExpired" }));
  }, [dispatch, retryAt]);

  useEffect(() => {
    if (!isOpen || ready === null) return;
    analytics.observeJob(ready.value);
    analytics.observeDisplay(ready.value);
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
    onFetched: receivePolled,
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
        { requestAction: "apply", adaptationId: appliedAdaptationId },
      );
    },
    [connection, dispatch, ready, settle, trackRef],
  );

  const choosing = state.status === "choosing" ? state : null;
  const resume = useCallback(() => {
    if (choosing === null) return;
    const { accessTier, resumable } = choosing;
    dispatch({ type: "loading" });
    settle(
      fetchState(resumable.adaptationId),
      { requestAction: "resume", adaptationId: resumable.adaptationId },
      (value) => {
        analytics.ignoreHistoricalJob(value);
        trackRef.current({
          name: "Adaptation Started",
          componentType: "resource_adapter_dialog",
          adaptationId: value.adaptationId,
          accessTier,
          startMode: "resumed",
        });
      },
    );
  }, [analytics, choosing, dispatch, fetchState, settle, trackRef]);

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
      if (revision !== revisionRef.current) return;
      dispatch({ type: "refreshed", value });
      analytics.observeUsageLimit(value.modelWorkBlocked, {
        adaptationId,
        requestAction: "refresh",
      });
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
  }, [adaptationId, analytics, dispatch, fetchState, trackRef]);

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

  const confirmSpend = useCallback(() => {
    spendConfirmedForRef.current = openAction(lessonKey, replacingRef.current);
    setOpenCount((count) => count + 1);
  }, [lessonKey]);

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
    confirmSpend,
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
