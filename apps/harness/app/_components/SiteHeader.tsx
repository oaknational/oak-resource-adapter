"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";

import styles from "../page.module.css";
import type { ApiHealthState } from "../_hooks/useApiHealth";

const apiHealthLabels: Record<ApiHealthState, string> = {
  checking: "Checking",
  healthy: "Healthy",
  unavailable: "Unavailable",
};

export function SiteHeader({
  apiHealthState,
}: Readonly<{ apiHealthState: ApiHealthState }>) {
  const { isSignedIn } = useAuth();

  return (
    <header className={styles.header}>
      <div>
        <p className={styles.brand}>Oak National Academy</p>
        <p className={styles.harnessLabel}>Resource Adapter harness</p>
      </div>
      <output className={`${styles.apiHealth} ${styles[apiHealthState]}`}>
        <span aria-hidden="true" className={styles.healthDot} />
        API /health: {apiHealthLabels[apiHealthState]}
      </output>
      {isSignedIn ? <UserButton /> : <SignInButton mode="modal" />}
    </header>
  );
}
