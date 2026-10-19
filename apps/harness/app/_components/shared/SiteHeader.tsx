"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";

import { AccessIndicator } from "./AccessIndicator";
import { ApiHealthIndicator } from "./ApiHealthIndicator";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <header className={styles.header}>
      <div>
        <p className={styles.brand}>Oak National Academy</p>
        <p className={styles.harnessLabel}>Resource Adapter harness</p>
      </div>
      <ApiHealthIndicator />
      <AccessIndicator />
      {isLoaded && (isSignedIn ? <UserButton /> : <SignInButton mode="modal" />)}
    </header>
  );
}
