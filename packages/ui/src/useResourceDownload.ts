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

/** One downloadable file. `key` identifies its prepared artifact. */
export type ResourceDownloadTarget = Readonly<{ key: string; format: string }>;

export function useResourceDownload<Target extends ResourceDownloadTarget>({
  apiBaseUrl,
  getToken,
  resourceDocumentId,
  enabled,
  prepare,
  onStale,
  onDownloaded,
  onFailed,
  onError,
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  resourceDocumentId: string;
  enabled: boolean;
  prepare: (target: Target, signal: AbortSignal) => Promise<{ artifactId: string }>;
  onStale: () => Promise<void>;
  onDownloaded?: (target: Target) => void;
  onFailed?: (target: Target) => void;
  onError?: ResourceAdapterErrorHandler | undefined;
}>) {
  const [state, setState] = useState<ResourceDownloadState>({ phase: "idle" });
  const [tooLargeKeys, setTooLargeKeys] = useState<ReadonlySet<string>>(new Set());
  const request = useRef<AbortController | null>(null);
  const artifactIds = useRef(new Map<string, string>());

  useEffect(() => {
    artifactIds.current.clear();
    setState({ phase: "idle" });
    setTooLargeKeys(new Set());
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [apiBaseUrl, resourceDocumentId, enabled]);

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
    target: Target,
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
    if (stage === "delivery" && status === 404) artifactIds.current.delete(target.key);
    onFailed?.(target);
    reportToHost(onError, error);
    if (status === 413) setTooLargeKeys((keys) => new Set(keys).add(target.key));
    setState({ phase: status === 413 ? "tooLarge" : "error", error, stage });
  }

  async function download(target: Target) {
    if (request.current !== null || !enabled) return;
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    let stage: DownloadStage = "preparation";
    try {
      let artifactId = artifactIds.current.get(target.key);
      if (artifactId === undefined) {
        setState({ phase: "preparing" });
        const prepared = await prepare(target, signal);
        if (signal.aborted) return;
        artifactId = prepared.artifactId;
        artifactIds.current.set(target.key, artifactId);
      }
      stage = "delivery";
      setState({ phase: "downloading" });
      const { blob, contentDisposition } = await fetchResourceArtifact({
        apiBaseUrl,
        getToken,
        artifactId,
        signal,
      });
      if (signal.aborted) return;
      downloadBlob(blob, downloadFilename(contentDisposition, target.format));
      setState({ phase: "done" });
      onDownloaded?.(target);
    } catch (error) {
      await handleFailure(target, error, stage, signal);
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return { state, download, tooLargeKeys };
}
