"use client";

import { useAuth } from "@clerk/nextjs";
import {
  getTeacherAllowance,
  type TeacherAllowance,
} from "@oaknational/resource-adapter/internal/allowance";
import { useEffect, useId, useState } from "react";

import { useDisclosure } from "../../_hooks/useDisclosure";
import { resolveApiBaseUrl } from "../../harness-api";
import styles from "../../page.module.css";

function clerkInstance(publishableKey: string | undefined): string {
  if (publishableKey?.startsWith("pk_live_")) return "production";
  if (publishableKey?.startsWith("pk_test_")) return "development";
  return "unknown";
}

const instance = clerkInstance(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const DISPLAY = {
  error: { className: styles.unavailable, label: "Unavailable" },
  loaded: { className: styles.limited, label: "Limited" },
  loading: { className: styles.checking, label: "Checking" },
} as const;

export function AccessIndicator() {
  const { getToken, isSignedIn, userId } = useAuth();
  return isSignedIn && userId ? (
    <AccountAccessIndicator key={userId} userId={userId} getToken={getToken} />
  ) : null;
}

function AccountAccessIndicator({
  userId,
  getToken,
}: Readonly<{
  userId: string;
  getToken: ReturnType<typeof useAuth>["getToken"];
}>) {
  const { buttonRef, containerRef, isOpen, toggle } = useDisclosure();
  const [status, setStatus] = useState<keyof typeof DISPLAY>("loading");
  const [allowance, setAllowance] = useState<TeacherAllowance | null>(null);
  // Set only by a result, so a full-access account never sees it appear.
  const [isVisible, setIsVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const headingId = useId();
  const panelId = useId();

  useEffect(() => {
    let current = true;
    getTeacherAllowance({ apiBaseUrl: resolveApiBaseUrl(), getToken }).then(
      (value) => {
        if (!current) return;
        setAllowance(value);
        setStatus("loaded");
        setIsVisible(value.tier === "limited");
      },
      () => {
        if (!current) return;
        setStatus("error");
        setIsVisible(true);
      },
    );
    return () => {
      current = false;
    };
  }, [getToken, attempt]);

  if (!isVisible) {
    return null;
  }
  const { className, label } = DISPLAY[status];
  const command = `pnpm access:grant ${userId}`;
  const retry = () => {
    setStatus("loading");
    setAttempt((value) => value + 1);
  };
  const togglePanel = () => {
    if (!isOpen) retry();
    toggle();
  };

  return (
    <div className={styles.accessDisclosure} ref={containerRef}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className={`${styles.apiHealth} ${className}`}
        onClick={togglePanel}
        ref={buttonRef}
        type="button"
      >
        <span aria-hidden="true" className={styles.healthDot} />
        Access: {label}
      </button>
      <section
        aria-labelledby={headingId}
        className={styles.apiHealthPanel}
        hidden={!isOpen}
        id={panelId}
      >
        <div className={styles.apiHealthPanelHeader}>
          <h2 id={headingId}>ORA access</h2>
          <span className={`${styles.healthBadge} ${className}`}>{label}</span>
        </div>
        {status === "loading" ? <p role="status">Checking access…</p> : null}
        {status === "error" ? (
          <p role="alert">
            Access could not be checked.{" "}
            <button type="button" onClick={retry}>
              Try again
            </button>
          </p>
        ) : null}
        <dl>
          {allowance?.tier === "limited" ? (
            <div>
              <dt>Adaptations left this month</dt>
              <dd>
                {allowance.remaining} of {allowance.limit}, refilling{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(allowance.resetsAt))}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Clerk user</dt>
            <dd>
              <code>{userId}</code> on the {instance} instance
            </dd>
          </div>
          <div>
            <dt>Give this account full access</dt>
            <dd>
              Run <code>{command}</code> with a {instance} <code>CLERK_SECRET_KEY</code>
              .
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
