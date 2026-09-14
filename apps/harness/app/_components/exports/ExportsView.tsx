"use client";

import { useEffect, useRef, useState } from "react";

import { downloadBlob } from "./download-blob";
import { exportDocx } from "./export-api";
import { ScenarioNavigation } from "../shared/ScenarioNavigation";
import styles from "../../page.module.css";
import type { HarnessView } from "../../scenario-types";

type ExportsViewProps = Extract<HarnessView, { section: "exports" }> &
  Readonly<{ lessonId: string }>;

export function ExportsView({
  fixtureId,
  fixtures,
  lessonId,
  resourceDocument,
}: ExportsViewProps) {
  const [embedFigures, setEmbedFigures] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function download() {
    // The disabled button already stops a second click, but re-entry from any
    // other caller would clobber the in-flight controller and re-enable the
    // controls under it.
    if (request.current !== null) return;

    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setDownloaded(false);

    try {
      const result = await exportDocx(
        { document: resourceDocument, embedFigures },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      downloadBlob(result.blob, result.filename);
      setDownloaded(true);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "DOCX export failed.");
    } finally {
      request.current = null;
      setLoading(false);
    }
  }

  return (
    <>
      <ScenarioNavigation
        hrefFor={(id) => `/?view=exports&fixture=${id}&lesson=${lessonId}`}
        items={fixtures.map(({ id, title }) => ({ id, title, detail: id }))}
        label="Export fixtures"
        selectedId={fixtureId}
      />
      <article className={styles.smokeTests}>
        <p className={styles.eyebrow}>Development spike</p>
        <h1>Exports</h1>
        <p>Download a fixture as a Word document without running a transformation.</p>
        <section aria-labelledby="docx-export-controls" className={styles.controls}>
          <div className={styles.controlHeader}>
            <h2 id="docx-export-controls">DOCX export</h2>
          </div>
          <p>
            <label>
              <input
                checked={embedFigures}
                disabled={loading}
                onChange={(event) => setEmbedFigures(event.target.checked)}
                type="checkbox"
              />{" "}
              Embed figures
            </label>
          </p>
          <p className={styles.controlNote}>
            Pupil content only: answers are excluded and maths is plain text. Figures
            fall back to their caption and alt text unless they are a PNG or JPEG from
            an origin the API allows.
          </p>
          <p className={styles.controlNote}>
            Worksheets use Lexend, which is not embedded.{" "}
            <a
              href="https://fonts.google.com/specimen/Lexend"
              target="_blank"
              rel="noreferrer"
            >
              <span>Install Lexend</span>
              <span className={styles.visuallyHidden}> (opens in a new tab)</span>
            </a>{" "}
            to see the intended layout.
          </p>
          <div className={styles.actionBar}>
            <fieldset className={styles.primaryActions}>
              <legend className={styles.visuallyHidden}>Export actions</legend>
              <button
                className={styles.primaryButton}
                disabled={loading}
                onClick={() => void download()}
                type="button"
              >
                {loading ? "Generating DOCX…" : "Download DOCX"}
              </button>
            </fieldset>
          </div>
          <p aria-live="polite" className={styles.requestStatus} role="status">
            {downloaded && (
              <span className={styles.successMessage}>
                <svg
                  aria-hidden="true"
                  focusable="false"
                  height="18"
                  viewBox="0 0 20 20"
                  width="18"
                >
                  <path
                    d="M4 10.5 8 14.5 16 6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                  />
                </svg>
                Download started.
              </span>
            )}
          </p>
          {error !== null && (
            <p className={styles.errorMessage} role="alert">
              {error}
            </p>
          )}
        </section>
      </article>
    </>
  );
}
