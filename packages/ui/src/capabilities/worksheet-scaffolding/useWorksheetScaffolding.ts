"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WorksheetScaffoldingEntry,
  WorksheetScaffoldingResumable,
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
  retryWorksheetScaffoldingReview,
  enqueueWorksheetScaffoldingDismissal,
  undoWorksheetScaffoldingReview,
} from "../../worksheetScaffolding.js";

type ScaffoldingAction = "accept" | "dismiss" | "remove" | "retry" | "undo";

export type WorkflowState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "choosing"; resumable: WorksheetScaffoldingResumable }>
  | Readonly<{ status: "ready"; value: WorksheetScaffoldingState }>
  | Readonly<{ status: "error" }>;

type WorksheetSuggestion = WorksheetScaffoldingState["suggestions"][number];

/**
 * `listedSuggestions` is the list as it stood when applying began. The applied
 * suggestion leaves `state` before its job finishes, so rendering from the live
 * list would drop the row the pupil-facing spinner belongs in.
 */
export type ApplyingSuggestion = Readonly<{
  id: WorksheetSuggestion["id"];
  listedSuggestions: WorksheetScaffoldingState["suggestions"];
  targetBlockId: WorksheetSuggestion["targetBlockId"];
}>;

type OpenRequest = Readonly<{
  key: string;
  promise: Promise<WorksheetScaffoldingEntry>;
}>;

type ReplacementRequest = Readonly<{ adaptationId: string; requestId: string }>;

const FIRST_POLL_DELAY_MS = 100;
const MAX_POLL_DELAY_MS = 750;

/**
 * Escalates from the first delay to the cap. A removal or dismissal finishes in
 * well under a second, so a fixed cadence spends most of that job's life waiting
 * to notice it; a model run takes many seconds and gains nothing from being asked
 * about seven times a second.
 */
export function worksheetScaffoldingPollDelay(attempt: number): number {
  return Math.min(FIRST_POLL_DELAY_MS * 2 ** attempt, MAX_POLL_DELAY_MS);
}

function stateFromEntry(entry: WorksheetScaffoldingEntry): WorkflowState {
  return entry.outcome === "resumable"
    ? { status: "choosing", resumable: entry.resumable }
    : { status: "ready", value: entry.state };
}

export function jobIsBusy(state: WorksheetScaffoldingState): boolean {
  return state.job?.status === "queued" || state.job?.status === "running";
}

function suggestionGenerationIsBusy(state: WorksheetScaffoldingState): boolean {
  return state.job?.kind === "suggestions.generate" && jobIsBusy(state);
}

function suggestionApplicationIsBusy(state: WorksheetScaffoldingState): boolean {
  return state.job?.kind === "suggestions.apply" && jobIsBusy(state);
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
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  isOpen: boolean;
  lesson: LessonContext;
  onError?: ResourceAdapterErrorHandler;
}>) {
  const [state, setState] = useState<WorkflowState>({ status: "idle" });
  const [applyingSuggestion, setApplyingSuggestion] =
    useState<ApplyingSuggestion | null>(null);
  const [documentIsVisible, setDocumentIsVisible] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [pollCount, setPollCount] = useState(0);
  const [actionInFlight, setActionInFlight] = useState<ScaffoldingAction | null>(null);
  const openRequestRef = useRef<OpenRequest | null>(null);
  const replacingRef = useRef<ReplacementRequest | null>(null);
  const workflowGenerationRef = useRef(0);
  const pollAttemptRef = useRef<{ attempt: number; jobId: string | null }>({
    attempt: 0,
    jobId: null,
  });
  const applicationStatusRef = useRef<HTMLDivElement | null>(null);
  const getTokenRef = useLatestRef(getToken);
  const lessonRef = useLatestRef(lesson);
  const onErrorRef = useLatestRef(onError);
  const lessonKey = JSON.stringify(lesson);

  const hideWorkflowDocument = useCallback(() => {
    setApplyingSuggestion(null);
    setActionInFlight(null);
    setDocumentIsVisible(false);
  }, []);

  const failWith = useCallback(
    (error: unknown) => {
      reportToHost(onErrorRef.current, error);
      setState({ status: "error" });
    },
    [onErrorRef],
  );

  useEffect(() => {
    let cancelled = false;
    workflowGenerationRef.current += 1;
    if (!isOpen) {
      openRequestRef.current = null;
      replacingRef.current = null;
      hideWorkflowDocument();
      setState({ status: "idle" });
      return;
    }

    hideWorkflowDocument();
    setState({ status: "loading" });
    const replacing = replacingRef.current;
    const requestKey = `${apiBaseUrl}:${lessonKey}:${retryCount}:${replacing?.requestId ?? ""}`;
    const request =
      openRequestRef.current?.key === requestKey
        ? openRequestRef.current
        : {
            key: requestKey,
            promise: openWorksheetScaffolding({
              apiBaseUrl,
              getToken: () => getTokenRef.current(),
              lesson: lessonRef.current,
              ...(replacing === null ? {} : { replacing }),
            }),
          };
    openRequestRef.current = request;
    void request.promise
      .then((entry) => {
        // The declined adaptation is abandoned once, so asking to replace it
        // again would be refused.
        replacingRef.current = null;
        if (!cancelled) {
          if (entry.outcome === "opened") {
            setDocumentIsVisible(!suggestionGenerationIsBusy(entry.state));
          }
          setState(stateFromEntry(entry));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          failWith(error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    apiBaseUrl,
    failWith,
    getTokenRef,
    hideWorkflowDocument,
    isOpen,
    lessonKey,
    lessonRef,
    retryCount,
  ]);

  const adaptationId = state.status === "ready" ? state.value.adaptationId : null;
  const busy = state.status === "ready" && jobIsBusy(state.value);
  const busyJobId = state.status === "ready" ? (state.value.job?.id ?? null) : null;

  useEffect(() => {
    if (!isOpen || adaptationId === null || !busy) {
      return;
    }
    // Each job escalates from scratch, or the next one would inherit the last
    // one's cadence and take a second to notice a change that already happened.
    const attempt =
      pollAttemptRef.current.jobId === busyJobId ? pollAttemptRef.current.attempt : 0;
    pollAttemptRef.current = { attempt: attempt + 1, jobId: busyJobId };
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getWorksheetScaffolding({
        adaptationId,
        apiBaseUrl,
        getToken: () => getTokenRef.current(),
      })
        .then((value) => {
          if (!cancelled) {
            if (!suggestionGenerationIsBusy(value)) {
              setDocumentIsVisible(true);
            }
            if (!suggestionApplicationIsBusy(value)) {
              setApplyingSuggestion(null);
            }
            if (!jobIsBusy(value)) {
              setActionInFlight(null);
            }
            setState({ status: "ready", value });
            setPollCount((count) => count + 1);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            failWith(error);
          }
        });
    }, worksheetScaffoldingPollDelay(attempt));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    adaptationId,
    apiBaseUrl,
    busy,
    busyJobId,
    failWith,
    getTokenRef,
    isOpen,
    pollCount,
  ]);

  // Applying removes the chosen button, so focus follows its local progress marker.
  useEffect(() => {
    if (applyingSuggestion !== null) {
      applicationStatusRef.current?.focus();
    }
  }, [applyingSuggestion]);

  const applySuggestion = useCallback(
    (suggestionId: string) => {
      if (
        state.status !== "ready" ||
        jobIsBusy(state.value) ||
        applyingSuggestion !== null
      ) {
        return;
      }
      const suggestion = state.value.suggestions.find(
        (candidate) => candidate.id === suggestionId,
      );
      if (suggestion === undefined) {
        return;
      }
      setApplyingSuggestion({
        id: suggestion.id,
        listedSuggestions: state.value.suggestions,
        targetBlockId: suggestion.targetBlockId,
      });
      const workflowGeneration = workflowGenerationRef.current;
      void applyWorksheetScaffoldingSuggestion({
        adaptationId: state.value.adaptationId,
        apiBaseUrl,
        getToken: () => getTokenRef.current(),
        suggestionId,
      })
        .then((value) => {
          if (workflowGenerationRef.current !== workflowGeneration) {
            return;
          }
          if (!suggestionApplicationIsBusy(value)) {
            setApplyingSuggestion(null);
          }
          setState({ status: "ready", value });
        })
        .catch((error: unknown) => {
          if (workflowGenerationRef.current !== workflowGeneration) {
            return;
          }
          setApplyingSuggestion(null);
          failWith(error);
        });
    },
    [apiBaseUrl, applyingSuggestion, failWith, getTokenRef, state],
  );

  const resume = useCallback(
    (adaptationId_: string) => {
      setDocumentIsVisible(true);
      setState({ status: "loading" });
      const workflowGeneration = workflowGenerationRef.current;
      void getWorksheetScaffolding({
        adaptationId: adaptationId_,
        apiBaseUrl,
        getToken: () => getTokenRef.current(),
      })
        .then((value) => {
          if (workflowGenerationRef.current === workflowGeneration) {
            setState({ status: "ready", value });
          }
        })
        .catch((error: unknown) => {
          if (workflowGenerationRef.current === workflowGeneration) {
            failWith(error);
          }
        });
    },
    [apiBaseUrl, failWith, getTokenRef],
  );

  /**
   * One in-flight action at a time. `select` both guards the action and gathers
   * its request, so an action that no longer applies never reaches the API.
   */
  const runAction = useCallback(
    <TRequest>(
      action: ScaffoldingAction,
      select: (ready: WorksheetScaffoldingState) => TRequest | null,
      request: (
        options: TRequest & { apiBaseUrl: string; getToken: GetToken },
      ) => Promise<WorksheetScaffoldingState>,
    ) => {
      if (
        state.status !== "ready" ||
        jobIsBusy(state.value) ||
        actionInFlight !== null
      ) {
        return;
      }
      const selected = select(state.value);
      if (selected === null) {
        return;
      }
      setActionInFlight(action);
      const workflowGeneration = workflowGenerationRef.current;
      void request({
        ...selected,
        apiBaseUrl,
        getToken: () => getTokenRef.current(),
      })
        .then((value) => {
          if (workflowGenerationRef.current !== workflowGeneration) {
            return;
          }
          if (!jobIsBusy(value)) {
            setActionInFlight(null);
          }
          setState({ status: "ready", value });
        })
        .catch((error: unknown) => {
          if (workflowGenerationRef.current === workflowGeneration) {
            setActionInFlight(null);
            failWith(error);
          }
        });
    },
    [actionInFlight, apiBaseUrl, failWith, getTokenRef, state],
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
      ),
    [runAction],
  );

  const acceptReview = useCallback(
    () => runReviewAction("accept", acceptWorksheetScaffoldingReview),
    [runReviewAction],
  );

  const retryReview = useCallback(
    () =>
      runAction(
        "retry",
        ({ adaptationId, pendingReview }) =>
          pendingReview === null
            ? null
            : {
                adaptationId,
                attemptId: pendingReview.attemptId,
                requestId: newRequestId(),
              },
        retryWorksheetScaffoldingReview,
      ),
    [runAction],
  );

  const undoReview = useCallback(
    () => runReviewAction("undo", undoWorksheetScaffoldingReview),
    [runReviewAction],
  );

  const dismissTarget = useCallback(
    (targetBlockId: string | null) =>
      runAction(
        "dismiss",
        ({ adaptationId }) => ({ adaptationId, targetBlockId }),
        enqueueWorksheetScaffoldingDismissal,
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
      ),
    [runAction],
  );

  const startFresh = useCallback(
    (adaptationId_: string) => {
      replacingRef.current = {
        adaptationId: adaptationId_,
        requestId: newRequestId(),
      };
      hideWorkflowDocument();
      setRetryCount((count) => count + 1);
    },
    [hideWorkflowDocument],
  );

  const tryAgain = useCallback(() => {
    if (state.status === "ready" && state.value.job?.status === "failed") {
      replacingRef.current = {
        adaptationId: state.value.adaptationId,
        requestId: newRequestId(),
      };
    }
    hideWorkflowDocument();
    setRetryCount((count) => count + 1);
  }, [hideWorkflowDocument, state]);

  return {
    acceptReview,
    actionInFlight,
    applicationStatusRef,
    applySuggestion,
    applyingSuggestion,
    dismissTarget,
    documentIsVisible,
    removeContribution,
    resume,
    retryReview,
    startFresh,
    state,
    tryAgain,
    undoReview,
  } as const;
}
