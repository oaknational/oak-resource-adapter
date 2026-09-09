"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";

import { ApiHealthIndicator } from "./ApiHealthIndicator";
import styles from "../../page.module.css";

export function SiteHeader() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <header className={styles.header}>
      <div>
        <p className={styles.brand}>Oak National Academy</p>
        <p className={styles.harnessLabel}>Resource Adapter harness</p>
      </div>
      <ApiHealthIndicator />
      {isLoaded && (isSignedIn ? <UserButton /> : <SignInButton mode="modal" />)}
    </header>
  );
}
