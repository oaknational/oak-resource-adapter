"use client";

import { useEffect, useRef, useState } from "react";

import { fetchResourceArtifact } from "./client.js";
import { downloadBlob, downloadFilename } from "./downloads.js";
import { ResourceAdapterApiError, reportToHost } from "./errors.js";
import type { GetToken, ResourceAdapterErrorHandler } from "./publicTypes.js";

type DownloadStage = "preparation" | "delivery" | "refresh";
export type ResourceDownloadState =
  | { phase: "idle" | "preparing" | "downloading" | "refreshing" | "done" }
  | { phase: "error" | "tooLarge"; error: unknown; stage: DownloadStage };

export function useResourceDownload({
  apiBaseUrl,
  getToken,
  resourceDocumentId,
  format,
  enabled,
  prepare,
  onStale,
  onError,
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  resourceDocumentId: string;
  format: string;
  enabled: boolean;
  prepare: (signal: AbortSignal) => Promise<{ artifactId: string }>;
  onStale: () => Promise<void>;
  onError?: ResourceAdapterErrorHandler | undefined;
}>) {
  const [state, setState] = useState<ResourceDownloadState>({ phase: "idle" });
  const request = useRef<AbortController | null>(null);
  const artifactId = useRef<string | null>(null);

  useEffect(() => {
    artifactId.current = null;
    setState({ phase: "idle" });
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [apiBaseUrl, resourceDocumentId, format, enabled]);

  async function refreshStaleDocument(signal: AbortSignal) {
    setState({ phase: "refreshing" });
    try {
      await onStale();
      if (!signal.aborted) setState({ phase: "idle" });
    } catch (error) {
      if (signal.aborted) return;
      reportToHost(onError, error);
      setState({ phase: "error", error, stage: "refresh" });
    }
  }

  async function handleFailure(
    error: unknown,
    stage: DownloadStage,
    signal: AbortSignal,
  ) {
    if (signal.aborted) return;
    const status = error instanceof ResourceAdapterApiError ? error.status : undefined;
    if (stage === "preparation" && status === 409) {
      await refreshStaleDocument(signal);
      return;
    }
    // A collected artifact never returns, so drop the id and let the retry prepare a new one.
    if (stage === "delivery" && status === 404) artifactId.current = null;
    reportToHost(onError, error);
    setState({ phase: status === 413 ? "tooLarge" : "error", error, stage });
  }

  async function download() {
    if (request.current !== null || !enabled) return;
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    let stage: DownloadStage = "preparation";
    try {
      if (artifactId.current === null) {
        setState({ phase: "preparing" });
        const prepared = await prepare(signal);
        if (signal.aborted) return;
        artifactId.current = prepared.artifactId;
      }
      stage = "delivery";
      setState({ phase: "downloading" });
      const { blob, contentDisposition } = await fetchResourceArtifact({
        apiBaseUrl,
        getToken,
        artifactId: artifactId.current,
        signal,
      });
      if (signal.aborted) return;
      downloadBlob(blob, downloadFilename(contentDisposition, format));
      setState({ phase: "done" });
    } catch (error) {
      await handleFailure(error, stage, signal);
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return { state, download };
}
