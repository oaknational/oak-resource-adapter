"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { downloadArtifactFile } from "./artifact-api";
import { downloadBlob } from "@oaknational/resource-adapter/internal/downloads";
import styles from "../../page.module.css";

export function ArtifactDownloadPanel({
  artifactId,
  isShared,
}: Readonly<{ artifactId: string | undefined; isShared: boolean }>) {
  const { getToken, isSignedIn } = useAuth();
  const active = useRef<AbortController | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => active.current?.abort(), []);

  async function download() {
    if (!artifactId || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError(null);
    setStatus("Downloading file…");
    try {
      const token = await getToken();
      if (controller.signal.aborted) return;
      if (!token) throw new Error("Sign in to download this file.");
      const result = await downloadArtifactFile(artifactId, token, controller.signal);
      if (controller.signal.aborted) return;
      downloadBlob(result.blob, result.filename);
      setStatus("Download started.");
    } catch (cause) {
      if (!controller.signal.aborted) {
        setStatus("");
        setError(
          cause instanceof Error ? cause.message : "The download failed. Try again.",
        );
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <section aria-labelledby="artifact-download-heading" className={styles.controls}>
      <h2 id="artifact-download-heading">
        {isShared ? "Shared download fixture" : "Stored download"}
      </h2>
      <p>
        {isShared
          ? "Download the shared fixture through the authenticated download route."
          : "Download the file specified in the URL. Sign in with the account that owns it."}
      </p>
      {isShared && (
        <p role="note" className={styles.fixtureWarning}>
          <strong>Test account only.</strong> If you are signed in with your own
          account, this download is expected to fail. Only the test account that owns
          this file can download it. To test with your own account, use the “Your
          download fixture” panel.
        </p>
      )}
      {!artifactId && (
        <p>
          {isShared
            ? "Configure RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID on the harness after provisioning the shared download fixture."
            : "Provide an artifact ID using the artifact URL parameter."}
        </p>
      )}
      {!isSignedIn && <p>Sign in using the account menu to download this file.</p>}
      <div className={styles.actionBar}>
        <fieldset className={styles.primaryActions}>
          <legend className={styles.visuallyHidden}>Stored download</legend>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={!artifactId || !isSignedIn || loading}
            onClick={() => void download()}
          >
            {loading ? "Downloading…" : "Download stored DOCX"}
          </button>
        </fieldset>
      </div>
      <p role="status" aria-live="polite" className={styles.artifactFeedback}>
        {status}
      </p>
      {error && (
        <p role="alert" className={`${styles.errorMessage} ${styles.artifactFeedback}`}>
          {error}
        </p>
      )}
    </section>
  );
}
