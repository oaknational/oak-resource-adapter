"use client";

import { useEffect, useRef, useState } from "react";

import { fetchOakMaterial, type OakMaterialPart } from "./oak-material-api";
import type { LessonScenario } from "../../scenario-types";

export type OakMaterialState = "error" | "idle" | "loading" | "ready";

export function useOakMaterial(lesson: LessonScenario["lesson"]) {
  const [parts, setParts] = useState<readonly OakMaterialPart[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<OakMaterialState>("idle");
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setParts([]);
    setError(null);
    setState("idle");
  }, [lesson.lessonSlug, lesson.programmeSlug]);

  async function load() {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setError(null);
    setState("loading");

    try {
      const loaded = await fetchOakMaterial(lesson, controller.signal);

      if (!controller.signal.aborted) {
        setParts(loaded);
        setState("ready");
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error ? cause.message : "The material could not load.",
        );
        setState("error");
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
      }
    }
  }

  return {
    error,
    load: () => void load(),
    parts,
    state,
  } as const;
}
