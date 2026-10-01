"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  WorksheetScaffoldingEntry,
  WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";

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

type OpenRequest = Readonly<{
  key: string;
  promise: Promise<WorksheetScaffoldingEntry>;
}>;

type ReplacementRequest = Readonly<{ adaptationId: string; requestId: string }>;

type Connection = Readonly<{ apiBaseUrl: string; getToken: GetToken }>;

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
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onError?: ResourceAdapterErrorHandler;
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
    (request: Promise<WorksheetScaffoldingState>, type: "received" | "resumed") => {
      const session = sessionRef.current;
      void request.then(
        (value) => {
          if (sessionRef.current === session) dispatch({ type, value });
        },
        (error: unknown) => {
          if (sessionRef.current === session) failWith(error);
        },
      );
    },
    [dispatch, failWith],
  );

  useEffect(() => {
    let cancelled = false;
    sessionRef.current += 1;
    if (!isOpen) {
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
        if (!cancelled) dispatch({ type: "opened", entry });
      },
      (error: unknown) => {
        if (!cancelled) failWith(error);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [connection, dispatch, failWith, isOpen, lessonKey, lessonRef, openCount]);

  const ready = state.status === "ready" ? state : null;
  const adaptationId = ready?.value.adaptationId ?? null;

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
    onFailed: failWith,
  });

  const applySuggestion = useCallback(
    (suggestionId: string) => {
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
      dispatch({ type: "applyStarted", suggestion });
      settle(
        applyWorksheetScaffoldingSuggestion({
          ...connection,
          adaptationId: ready.value.adaptationId,
          suggestionId,
        }),
        "received",
      );
    },
    [connection, dispatch, ready, settle],
  );

  const resume = useCallback(
    (resumedAdaptationId: string) => {
      dispatch({ type: "loading" });
      settle(fetchState(resumedAdaptationId), "resumed");
    },
    [dispatch, fetchState, settle],
  );

  /**
   * One in-flight action at a time. `select` both guards the action and gathers
   * its request, so an action that no longer applies never reaches the API.
   */
  const runAction = useCallback(
    <TRequest>(
      select: (value: WorksheetScaffoldingState) => TRequest | null,
      request: (options: TRequest & Connection) => Promise<WorksheetScaffoldingState>,
    ) => {
      if (ready === null || jobIsBusy(ready.value) || ready.actionIsPending) {
        return;
      }
      const selected = select(ready.value);
      if (selected === null) {
        return;
      }
      dispatch({ type: "actionStarted" });
      settle(request({ ...selected, ...connection }), "received");
    },
    [connection, dispatch, ready, settle],
  );

  const runReviewAction = useCallback(
    (request: typeof acceptWorksheetScaffoldingReview) =>
      runAction(
        ({ adaptationId, pendingReview }) =>
          pendingReview === null
            ? null
            : { adaptationId, attemptId: pendingReview.attemptId },
        request,
      ),
    [runAction],
  );

  const acceptReview = useCallback(
    () => runReviewAction(acceptWorksheetScaffoldingReview),
    [runReviewAction],
  );

  const undoReview = useCallback(
    () => runReviewAction(undoWorksheetScaffoldingReview),
    [runReviewAction],
  );

  const retrySuggestions = useCallback(
    () =>
      runAction(
        ({ adaptationId }) => ({ adaptationId, requestId: newRequestId() }),
        retryWorksheetScaffoldingSuggestions,
      ),
    [runAction],
  );

  const retryTransformationReview = useCallback(
    () =>
      runAction(
        ({ adaptationId, pendingReview }) =>
          pendingReview === null
            ? null
            : {
                adaptationId,
                attemptId: pendingReview.attemptId,
                requestId: newRequestId(),
              },
        retryWorksheetScaffoldingTransformation,
      ),
    [runAction],
  );

  const dismissTarget = useCallback(
    (targetBlockId: string | null) =>
      runAction(
        ({ adaptationId }) => ({ adaptationId, targetBlockId }),
        enqueueWorksheetScaffoldingDismissal,
      ),
    [runAction],
  );

  const removeContribution = useCallback(
    (contributionId: string) =>
      runAction(
        ({ adaptationId, pendingReview }) =>
          pendingReview === null ? { adaptationId, contributionId } : null,
        enqueueWorksheetScaffoldingRemoval,
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
      if (revision === revisionRef.current) throw error;
    }
  }, [adaptationId, dispatch, fetchState]);

  const reopen = useCallback((replacingAdaptationId: string | null) => {
    if (replacingAdaptationId !== null) {
      replacingRef.current = {
        adaptationId: replacingAdaptationId,
        requestId: newRequestId(),
      };
    }
    setOpenCount((count) => count + 1);
  }, []);

  const tryAgain = useCallback(
    () =>
      reopen(ready?.value.job?.status === "failed" ? ready.value.adaptationId : null),
    [ready, reopen],
  );

  return {
    acceptReview,
    applySuggestion,
    dismissTarget,
    refresh,
    removeContribution,
    resume,
    retrySuggestions,
    retryTransformationReview,
    startFresh: reopen,
    state,
    tryAgain,
    undoReview,
  } as const;
}
