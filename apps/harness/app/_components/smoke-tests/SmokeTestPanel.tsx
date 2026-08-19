"use client";

import { useId, type ReactNode } from "react";

import styles from "../../page.module.css";

type SmokeTestPanelProps = {
  buttonLabel: string;
  children?: ReactNode;
  disabled?: boolean;
  heading: string;
  onRun: () => void;
  status?: string;
};

export function SmokeTestPanel({
  buttonLabel,
  children,
  disabled = false,
  heading,
  onRun,
  status,
}: SmokeTestPanelProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={styles.workerTest}>
      <h2 id={headingId}>{heading}</h2>
      <div className={styles.workerTestControls}>
        <button
          className={styles.workerTestButton}
          disabled={disabled}
          onClick={onRun}
          type="button"
        >
          {buttonLabel}
        </button>
        <div aria-live="polite">
          {status !== undefined && (
            <p className={styles.workerTestStatus}>Status: {status}</p>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
