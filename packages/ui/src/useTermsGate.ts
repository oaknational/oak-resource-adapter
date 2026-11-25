"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TrackAnalyticsEvent } from "./analytics.js";
import { reportToHost } from "./errors.js";
import type { GetToken, ResourceAdapterErrorHandler } from "./publicTypes.js";
import { acceptTerms, getTermsState } from "./terms.js";

export type TermsGateStatus =
  | "checking"
  | "checkFailed"
  | "required"
  | "accepting"
  | "acceptFailed"
  | "outdated"
  | "accepted";

/**
 * Checks once, the first time the dialog opens. A capability that is refused for
 * the terms afterwards calls `require` to show them again.
 */
export function useTermsGate({
  apiBaseUrl,
  getToken,
  isOpen,
  onError,
  track,
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  isOpen: boolean;
  onError?: ResourceAdapterErrorHandler | undefined;
  track: TrackAnalyticsEvent;
}>) {
  const [status, setStatus] = useState<TermsGateStatus>("checking");
  const [attempt, setAttempt] = useState(0);
  const startedAttempt = useRef<number | null>(null);
  const latest = useRef({ apiBaseUrl, getToken, onError });
  useEffect(() => {
    latest.current = { apiBaseUrl, getToken, onError };
  });

  useEffect(() => {
    if (!isOpen || startedAttempt.current === attempt) {
      return;
    }
    startedAttempt.current = attempt;
    let cancelled = false;
    let settled = false;
    setStatus("checking");
    getTermsState(latest.current).then(
      ({ accepted }) => {
        settled = true;
        if (!cancelled) setStatus(accepted ? "accepted" : "required");
      },
      (error: unknown) => {
        settled = true;
        reportToHost(latest.current.onError, error);
        if (!cancelled) setStatus("checkFailed");
      },
    );
    return () => {
      cancelled = true;
      // Closed before the answer arrived, so the next open asks again.
      if (!settled) startedAttempt.current = null;
    };
  }, [attempt, isOpen]);

  const accept = useCallback(
    (version: number) => {
      setStatus("accepting");
      acceptTerms({ ...latest.current, version }).then(
        ({ accepted }) => {
          if (accepted) {
            track({
              name: "Resource Adapter Terms Accepted",
              componentType: "accept_terms_button",
              termsVersion: version,
            });
          }
          setStatus(accepted ? "accepted" : "outdated");
        },
        (error: unknown) => {
          reportToHost(latest.current.onError, error);
          setStatus("acceptFailed");
        },
      );
    },
    [track],
  );

  const require = useCallback(() => setStatus("required"), []);
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);

  return { accept, require, retry, status };
}
