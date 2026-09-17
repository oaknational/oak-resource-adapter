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

type FixtureAction = "GET" | "POST" | "DELETE" | "download";

async function performFixtureAction(
  action: FixtureAction,
  artifactId: string | null | undefined,
  token: string,
  signal: AbortSignal,
): Promise<Fixture | undefined> {
  if (action === "download") {
    if (!artifactId) throw new Error("Refresh the fixture status before downloading.");
    const result = await downloadArtifactFile(artifactId, token, signal);
    if (!signal.aborted) downloadBlob(result.blob, result.filename);
    return;
  }
  const response = await fetch(`${adapterProxyPath}/dev/artifact-download-fixture`, {
    method: action,
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  });
  if (response.status === 404)
    throw new Error(
      "Your download fixture needs ENABLE_DEV_ROUTES enabled on a local, preview or staging API.",
    );
  if (!response.ok)
    throw new Error(
      "Could not update your fixture. Check API access, then refresh its status.",
    );
  return response.json();
}

function fixtureStatus(
  signedIn: boolean | undefined,
  busy: boolean,
  fixture: Fixture | null,
) {
  if (!signedIn) return "Sign in to manage your download fixture.";
  if (busy) return "Working…";
  if (!fixture) return "Fixture status unknown.";
  if (fixture.ready) return "Fixture ready to download.";
  if (fixture.stored)
    return "File stored; create the fixture to restore its database records.";
  if (fixture.artifactId)
    return "Stored file missing; create the fixture to restore it.";
  return "No download fixture stored.";
}

function fixtureStatusState(
  busy: boolean,
  error: string | null,
  fixture: Fixture | null,
) {
  if (busy) return "working";
  if (error) return "attention";
  if (!fixture) return "empty";
  if (fixture.ready) return "ready";
  if (fixture.stored || fixture.artifactId) return "attention";
  return "empty";
}

const statusIcons = {
  ready: "m8 12 3 3 5-6",
  working: "M12 7v5l3 2",
  attention: "M12 7v6m0 4h.01",
  empty: "M8 12h8",
} as const;

export function PersonalArtifactPanel() {
  const { getToken, isSignedIn, userId } = useAuth();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const run = useCallback(
    async (action: FixtureAction, artifactId?: string | null) => {
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
        const result = await performFixtureAction(
          action,
          artifactId,
          token,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (action === "download") setMessage("Download started.");
        else if (result) setFixture(result);
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

  const status = fixtureStatus(isSignedIn, busy, fixture);
  const statusState = fixtureStatusState(busy, error, fixture);

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
            <path d={statusIcons[statusState]} />
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
