"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  supportLevels,
  type WorksheetScaffoldingApplyRequest,
  type WorksheetScaffoldingEntry,
  type WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";

import { scheduleAt } from "../../scheduleAt.js";
import type { TrackAnalyticsEvent } from "../../analytics.js";
import type { CreateResourceAdapterClientOptions } from "../../client.js";
import { reportToHost } from "../../errors.js";
import type {
  GetToken,
  LessonContext,
  ResourceAdapterErrorHandler,
} from "../../publicTypes.js";
import { newRequestId } from "../../requestId.js";
import {
  applyWorksheetScaffoldingSuggestion,
  getWorksheetScaffolding,
  openWorksheetScaffolding,
} from "../../worksheetScaffolding.js";
import { useWorksheetScaffoldingActions } from "./useWorksheetScaffoldingActions.js";
import { useWorksheetScaffoldingPolling } from "./useWorksheetScaffoldingPolling.js";
import { jobIsBusy, workflowReducer, type WorkflowEvent } from "./workflowState.js";
import {
  createWorksheetAnalyticsTracker,
  type ComponentTypeFor,
  type TrackedRequest,
} from "./worksheetAnalytics.js";

type OpenRequest = Readonly<{
  key: string;
  promise: Promise<WorksheetScaffoldingEntry>;
}>;

type ReplacementRequest = Readonly<{ adaptationId: string; requestId: string }>;

function openAction(lessonKey: string, replacing: ReplacementRequest | null): string {
  return `${lessonKey}:${replacing?.requestId ?? ""}`;
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

  const connection = useMemo<CreateResourceAdapterClientOptions>(
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

  const {
    acceptReview,
    dismissTarget,
    removeContribution,
    retryAttempt,
    retrySuggestions,
    retryTransformationReview,
    undoReview,
  } = useWorksheetScaffoldingActions({ connection, dispatch, ready, settle, trackRef });

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
    retryAttempt,
    retryTransformationReview,
    startFresh,
    state,
    tryAgain,
    undoReview,
  } as const;
}
