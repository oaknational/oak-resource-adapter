"use client";

import { walkResourceDocument } from "@oaknational/resource-document";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  previewTransformation,
  runTransformation,
  type TransformationPreviewResponse,
  type TransformationRunResponse,
} from "./transformation-api";
import { useTransformationCatalogue } from "./useTransformationCatalogue";
import type { LessonScenario } from "../../scenario-types";
import type { ResourceDocument } from "@oaknational/resource-document";

export type TransformationRequestState = "idle" | "preview" | "run";

export function useTransformationWorkbench(scenario: LessonScenario) {
  const catalogue = useTransformationCatalogue();
  const [supportLevel, setSupportLevel] = useState("");
  const [targetBlockId, setTargetBlockId] = useState("");
  const [currentDocument, setCurrentDocument] = useState(scenario.document);
  const [history, setHistory] = useState<readonly ResourceDocument[]>([]);
  const [preview, setPreview] = useState<TransformationPreviewResponse | null>(null);
  const [result, setResult] = useState<TransformationRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<TransformationRequestState>("idle");
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

  useEffect(
    () => () => {
      requestGeneration.current += 1;
      requestController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    invalidateRequest();
    setCurrentDocument(scenario.document);
    setHistory([]);
  }, [invalidateRequest, scenario.document, scenario.id]);

  const targetNodes = useMemo(() => {
    const target = catalogue.selected?.target;
    if (target?.scope !== "node") return [];

    return Array.from(walkResourceDocument(currentDocument)).filter((node) =>
      target.nodeTypes.includes(node.type),
    );
  }, [catalogue.selected, currentDocument]);

  useEffect(() => {
    invalidateRequest();
    setSupportLevel(catalogue.selected?.supportLevels?.[0]?.level ?? "");
  }, [catalogue.selected, invalidateRequest]);

  // Keeps the chosen question while it still exists, so applying one scaffold
  // after another to the same task does not send the picker back to the top.
  useEffect(() => {
    setTargetBlockId((current) => {
      if (catalogue.selected?.target.scope !== "node") {
        return "";
      }

      return targetNodes.some(({ id }) => id === current)
        ? current
        : (targetNodes[0]?.id ?? "");
    });
  }, [catalogue.selected, targetNodes]);

  const unmetMaterial = (catalogue.selected?.materialRequirements ?? []).filter(
    ({ available, required }) => required && !available,
  );

  const params = supportLevel === "" ? {} : { supportLevel };
  const command =
    catalogue.selected === undefined
      ? null
      : {
          document: currentDocument,
          kind: catalogue.selected.kind,
          lesson: {
            lessonSlug: scenario.lesson.lessonSlug,
            programmeSlug: scenario.lesson.programmeSlug,
          },
          params,
          ...(catalogue.selected.target.scope === "node" ? { targetBlockId } : {}),
        };
  const canSubmit =
    command !== null &&
    unmetMaterial.length === 0 &&
    !(catalogue.selected?.target.scope === "node" && targetBlockId === "");

  async function perform(action: "preview" | "run") {
    if (!canSubmit || command === null) return;

    requestController.current?.abort();
    const controller = new AbortController();
    const generation = requestGeneration.current + 1;
    requestController.current = controller;
    requestGeneration.current = generation;
    setRequestState(action);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      if (action === "preview") {
        const response = await previewTransformation(command, controller.signal);
        if (requestGeneration.current === generation) setPreview(response);
      } else {
        const response = await runTransformation(
          {
            ...command,
            contributionId: crypto.randomUUID(),
          },
          controller.signal,
        );
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

  const outputs = result?.run.outcome === "APPLIED" ? result.run.outputs : [];
  const revision = outputs.find(({ purpose }) => purpose === "revised-resource");
  const companions = outputs.filter(({ purpose }) => purpose === "companion-document");

  function adoptOutput() {
    if (revision === undefined) return;
    invalidateRequest();
    setHistory((documents) => [...documents, currentDocument]);
    setCurrentDocument(revision.document);
  }

  function undo() {
    const previous = history.at(-1);
    if (previous === undefined) return;
    invalidateRequest();
    setCurrentDocument(previous);
    setHistory((documents) => documents.slice(0, -1));
  }

  function reset() {
    invalidateRequest();
    setCurrentDocument(scenario.document);
    setHistory([]);
  }

  function selectSupportLevel(value: string) {
    invalidateRequest();
    setSupportLevel(value);
  }

  function selectTargetBlock(value: string) {
    invalidateRequest();
    setTargetBlockId(value);
  }

  function selectTransformationKind(value: string) {
    invalidateRequest();
    catalogue.selectKind(value);
  }

  return {
    adoptOutput,
    canSubmit,
    catalogue: catalogue.catalogue,
    catalogueError: catalogue.error,
    materialCatalogue: catalogue.material,
    companions,
    currentDocument,
    error,
    historyDepth: history.length,
    outputDocument: revision?.document,
    preview,
    previewSelected: () => perform("preview"),
    requestState,
    reset,
    result,
    runSelected: () => perform("run"),
    selected: catalogue.selected,
    selectedKind: catalogue.selectedKind,
    selectKind: selectTransformationKind,
    setSupportLevel: selectSupportLevel,
    setTargetBlockId: selectTargetBlock,
    supportLevel,
    targetNodes,
    targetBlockId,
    undo,
    unmetMaterial,
  } as const;
}

export type TransformationWorkbench = ReturnType<typeof useTransformationWorkbench>;
