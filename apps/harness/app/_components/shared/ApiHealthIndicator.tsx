"use client";

import { useId } from "react";

import { useApiHealth } from "../../_hooks/useApiHealth";
import { useDisclosure } from "../../_hooks/useDisclosure";
import shared from "./shared.module.css";
import styles from "./ApiHealthIndicator.module.css";

const labels = {
  checking: "Checking",
  healthy: "Healthy",
  ready: "Ready",
  "not-ready": "Not ready",
  unavailable: "Unavailable",
};

const livenessMessages = {
  checking: "Checking whether the API is responding.",
  healthy: "The API is responding.",
  unavailable:
    "The liveness endpoint could not be reached or returned an invalid response.",
};

export function ApiHealthIndicator() {
  const { liveness, readiness } = useApiHealth();
  const headingId = useId();
  const panelId = useId();
  const { buttonRef, containerRef, isOpen, toggle } = useDisclosure();

  return (
    <div className={styles.apiHealthDisclosure} ref={containerRef}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className={`${styles.apiHealth} ${styles[readiness.status]}`}
        onClick={toggle}
        ref={buttonRef}
        type="button"
      >
        <span aria-hidden="true" className={styles.healthDot} />
        API: {labels[readiness.status]}
        <svg
          aria-hidden="true"
          className={styles.healthChevron}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {/* Outside the button: the button role has presentational children, so a
          live region nested inside it is not announced. */}
      <output aria-atomic="true" className={shared.visuallyHidden}>
        API: {labels[readiness.status]}
      </output>
      <section
        className={styles.apiHealthPanel}
        aria-labelledby={headingId}
        id={panelId}
        hidden={!isOpen}
      >
        <div className={styles.apiHealthPanelHeader}>
          <h2 id={headingId}>API status</h2>
          <span className={`${styles.healthBadge} ${styles[readiness.status]}`}>
            {labels[readiness.status]}
          </span>
        </div>
        <dl>
          <div>
            <dt>
              <span>Liveness:</span>{" "}
              <span
                className={`${styles.healthBadge} ${styles[liveness === "healthy" ? "ready" : liveness]}`}
              >
                {labels[liveness]}
              </span>
            </dt>
            <dd>{livenessMessages[liveness]}</dd>
          </div>
          {"checks" in readiness ? (
            Object.entries(readiness.checks).map(([key, check]) => (
              <div key={key}>
                <dt>
                  <span>{check.label}:</span>{" "}
                  <span className={`${styles.healthBadge} ${styles[check.status]}`}>
                    {labels[check.status]}
                  </span>
                </dt>
                <dd>{check.message}</dd>
              </div>
            ))
          ) : (
            <div>
              <dt>
                <span>Readiness:</span>{" "}
                <span className={`${styles.healthBadge} ${styles[readiness.status]}`}>
                  {labels[readiness.status]}
                </span>
              </dt>
              <dd>
                {readiness.status === "checking"
                  ? "Checking API configuration."
                  : "The readiness endpoint could not be reached or returned an invalid response. Check the API deployment and reload to try again."}
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}
