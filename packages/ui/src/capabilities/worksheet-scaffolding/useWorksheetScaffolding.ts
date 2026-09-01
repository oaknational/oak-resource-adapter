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
import {
  applyWorksheetScaffoldingSuggestion,
  getWorksheetScaffolding,
  openWorksheetScaffolding,
} from "../../worksheetScaffolding.js";

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

const POLL_INTERVAL_MS = 750;

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
  const openRequestRef = useRef<OpenRequest | null>(null);
  const replacingRef = useRef<string | null>(null);
  const workflowGenerationRef = useRef(0);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const getTokenRef = useLatestRef(getToken);
  const lessonRef = useLatestRef(lesson);
  const onErrorRef = useLatestRef(onError);
  const lessonKey = JSON.stringify(lesson);

  const hideWorkflowDocument = useCallback(() => {
    setApplyingSuggestion(null);
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
    const requestKey = `${apiBaseUrl}:${lessonKey}:${retryCount}:${replacing ?? ""}`;
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

  useEffect(() => {
    if (!isOpen || adaptationId === null || !busy) {
      return;
    }
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
            setState({ status: "ready", value });
            setPollCount((count) => count + 1);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            failWith(error);
          }
        });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [adaptationId, apiBaseUrl, busy, failWith, getTokenRef, isOpen, pollCount]);

  // Applying removes the chosen suggestion from the document, so focus moves to
  // the status banner rather than falling back to the top of the dialog.
  useEffect(() => {
    if (applyingSuggestion !== null) {
      statusRef.current?.focus();
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

  const startFresh = useCallback(
    (adaptationId_: string) => {
      replacingRef.current = adaptationId_;
      hideWorkflowDocument();
      setRetryCount((count) => count + 1);
    },
    [hideWorkflowDocument],
  );

  const tryAgain = useCallback(() => {
    if (state.status === "ready" && state.value.job?.status === "failed") {
      replacingRef.current = state.value.adaptationId;
    }
    hideWorkflowDocument();
    setRetryCount((count) => count + 1);
  }, [hideWorkflowDocument, state]);

  return {
    applySuggestion,
    applyingSuggestion,
    documentIsVisible,
    resume,
    startFresh,
    state,
    statusRef,
    tryAgain,
  } as const;
}
