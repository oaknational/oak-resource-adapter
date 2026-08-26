"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchSuggestionCatalogue,
  previewSuggestions,
  runSuggestions,
  type SuggestionFlow,
  type SuggestionPreviewResponse,
  type SuggestionRunResponse,
} from "./suggestion-api";
import type { LessonScenario } from "../../scenario-types";

export type SuggestionRequestState = "idle" | "preview" | "run";

export function useSuggestionWorkbench(scenario: LessonScenario) {
  const [flows, setFlows] = useState<readonly SuggestionFlow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SuggestionPreviewResponse | null>(null);
  const [result, setResult] = useState<SuggestionRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<SuggestionRequestState>("idle");
  const requestController = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);

  const invalidateRequest = useCallback(() => {
    requestGeneration.current += 1;
    requestController.current?.abort();
    requestController.current = null;
    setPreview(null);
    setResult(null);
    setError(null);
    setRequestState("idle");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSuggestionCatalogue()
      .then(({ flows: availableFlows }) => {
        if (cancelled) return;
        setFlows(availableFlows);
        setSelectedFlowId((current) =>
          availableFlows.some(({ id }) => id === current)
            ? current
            : (availableFlows[0]?.id ?? ""),
        );
        setCatalogueError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setCatalogueError(
            cause instanceof Error
              ? cause.message
              : "The suggestion-flow catalogue could not load.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      requestGeneration.current += 1;
      requestController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    invalidateRequest();
  }, [invalidateRequest, scenario.document, scenario.id]);

  function selectFlow(flowId: string) {
    invalidateRequest();
    setSelectedFlowId(flowId);
  }

  async function perform(action: "preview" | "run") {
    if (selectedFlowId === "" || requestState !== "idle") return;

    requestController.current?.abort();
    const controller = new AbortController();
    const generation = requestGeneration.current + 1;
    requestController.current = controller;
    requestGeneration.current = generation;
    setRequestState(action);
    setError(null);
    if (action === "preview") setPreview(null);
    if (action === "run") setResult(null);

    try {
      const command = { document: scenario.document, flowId: selectedFlowId };
      if (action === "preview") {
        const response = await previewSuggestions(command, controller.signal);
        if (requestGeneration.current === generation) setPreview(response);
      } else {
        const response = await runSuggestions(command, controller.signal);
        if (requestGeneration.current === generation) setResult(response);
      }
    } catch (cause) {
      if (requestGeneration.current === generation && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "The request failed.");
      }
    } finally {
      if (requestGeneration.current === generation) {
        requestController.current = null;
        setRequestState("idle");
      }
    }
  }

  return {
    canSubmit: selectedFlowId !== "",
    catalogueError,
    error,
    flows,
    preview,
    previewSelected: () => perform("preview"),
    requestState,
    result,
    runSelected: () => perform("run"),
    selectedFlow: flows.find(({ id }) => id === selectedFlowId),
    selectedFlowId,
    selectFlow,
  } as const;
}

export type SuggestionWorkbench = ReturnType<typeof useSuggestionWorkbench>;
