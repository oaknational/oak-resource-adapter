"use client";

import { useEffect, useRef, useState } from "react";
import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";

const FIRST_POLL_DELAY_MS = 100;
const MAX_POLL_DELAY_MS = 750;

/**
 * Escalates from the first delay to the cap. A removal or dismissal finishes in
 * well under a second, so a fixed cadence spends most of that job's life waiting
 * to notice it; a model run takes many seconds and gains nothing from being asked
 * about seven times a second.
 */
function pollDelay(attempt: number): number {
  return Math.min(FIRST_POLL_DELAY_MS * 2 ** attempt, MAX_POLL_DELAY_MS);
}

/** Callbacks must be stable: a new one restarts the timer. */
export function useWorksheetScaffoldingPolling({
  adaptationId,
  jobId,
  fetchState,
  onFetched,
  onFailed,
}: Readonly<{
  adaptationId: string | null;
  jobId: string | null;
  fetchState: (adaptationId: string) => Promise<WorksheetScaffoldingState>;
  onFetched: (value: WorksheetScaffoldingState) => void;
  onFailed: (error: unknown) => void;
}>) {
  const [pollCount, setPollCount] = useState(0);
  const attemptRef = useRef<{ attempt: number; jobId: string | null }>({
    attempt: 0,
    jobId: null,
  });

  useEffect(() => {
    if (adaptationId === null) {
      return;
    }
    // Each job escalates from scratch, or the next one would inherit the last
    // one's cadence and take a second to notice a change that already happened.
    const attempt = attemptRef.current.jobId === jobId ? attemptRef.current.attempt : 0;
    attemptRef.current = { attempt: attempt + 1, jobId };
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchState(adaptationId).then(
        (value) => {
          if (!cancelled) {
            onFetched(value);
            setPollCount((count) => count + 1);
          }
        },
        (error: unknown) => {
          if (!cancelled) {
            onFailed(error);
          }
        },
      );
    }, pollDelay(attempt));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [adaptationId, fetchState, jobId, onFailed, onFetched, pollCount]);
}
