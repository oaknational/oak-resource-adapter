"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { adapterProxyPath } from "../../harness-api";
import { downloadArtifactFile } from "./artifact-api";
import { downloadBlob } from "./download-blob";
import styles from "../../page.module.css";

type Fixture = {
  artifactId: string | null;
  stored: boolean;
  ready: boolean;
  environment: "local" | "preview" | "staging";
};

export function PersonalArtifactPanel() {
  const { getToken, isSignedIn, userId } = useAuth();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const run = useCallback(
    async (
      action: "GET" | "POST" | "DELETE" | "download",
      artifactId?: string | null,
    ) => {
      if (active.current) return;
      const controller = new AbortController();
      active.current = controller;
      setBusy(true);
      setError(null);
      setMessage("");
      try {
        const token = await getToken();
        if (controller.signal.aborted) return;
        if (!token) throw new Error("Sign in to manage your download fixture.");
        if (action === "download") {
          if (!artifactId) return;
          const result = await downloadArtifactFile(
            artifactId,
            token,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          downloadBlob(result.blob, result.filename);
          setMessage("Download started.");
        } else {
          const response = await fetch(
            `${adapterProxyPath}/dev/artifact-download-fixture`,
            {
              method: action,
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
              signal: controller.signal,
            },
          );
          if (!response.ok)
            throw new Error(
              response.status === 404
                ? "Your download fixture needs ENABLE_DEV_ROUTES enabled on a local, preview or staging API."
                : "Could not update your fixture. Check API access, then refresh its status.",
            );
          const result: Fixture = await response.json();
          if (!controller.signal.aborted) setFixture(result);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setFixture(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not check your fixture. Refresh its status to try again.",
          );
        }
      } finally {
        if (active.current === controller) {
          active.current = null;
          setBusy(false);
        }
      }
    },
    [getToken],
  );

  useEffect(() => {
    setFixture(null);
    setError(null);
    setMessage("");
    if (isSignedIn) void run("GET");
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [isSignedIn, userId, run]);

  const status = !isSignedIn
    ? "Sign in to manage your download fixture."
    : busy
      ? "Working…"
      : !fixture
        ? "Fixture status unknown."
        : fixture.ready
          ? "Fixture ready to download."
          : fixture.stored
            ? "File stored; create the fixture to restore its database records."
            : fixture.artifactId
              ? "Stored file missing; create the fixture to restore it."
              : "No download fixture stored.";
  const statusState = busy
    ? "working"
    : error || (fixture && !fixture.ready && (fixture.stored || fixture.artifactId))
      ? "attention"
      : fixture?.ready
        ? "ready"
        : "empty";

  return (
    <section className={styles.controls} aria-labelledby="personal-fixture-heading">
      <h2 id="personal-fixture-heading">Your download fixture</h2>
      <p>
        Create a DOCX owned by your account, download it, then delete it when you have
        finished testing.
      </p>
      {fixture && (
        <p className={styles.artifactFeedback}>
          Environment: <strong>{fixture.environment}</strong>
        </p>
      )}
      <div role="status" aria-live="polite" className={styles.fixtureStatus}>
        <span className={styles.fixtureStatusBadge} data-state={statusState}>
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            {statusState === "ready" ? (
              <path d="m8 12 3 3 5-6" />
            ) : statusState === "working" ? (
              <path d="M12 7v5l3 2" />
            ) : statusState === "attention" ? (
              <path d="M12 7v6m0 4h.01" />
            ) : (
              <path d="M8 12h8" />
            )}
          </svg>
          <span>{status}</span>
        </span>
        {message && <span>{message}</span>}
      </div>
      <div className={styles.actionBar}>
        <fieldset className={styles.primaryActions} disabled={!isSignedIn || busy}>
          <legend className={styles.visuallyHidden}>Your fixture actions</legend>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={fixture?.ready}
            onClick={() => void run("POST")}
          >
            Create my fixture
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={!fixture?.ready}
            onClick={() => void run("download", fixture?.artifactId)}
          >
            Download my DOCX
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={!fixture || (!fixture.stored && !fixture.artifactId)}
            onClick={() => void run("DELETE")}
          >
            Delete my fixture
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void run("GET")}
          >
            Refresh status
          </button>
        </fieldset>
      </div>
      {error && (
        <p role="alert" className={styles.errorMessage}>
          {error}
        </p>
      )}
    </section>
  );
}
