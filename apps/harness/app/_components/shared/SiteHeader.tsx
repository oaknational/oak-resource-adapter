"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccessIndicator } from "./AccessIndicator";
import { ApiHealthIndicator } from "./ApiHealthIndicator";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div>
        <p className={styles.brand}>Oak National Academy</p>
        <p className={styles.harnessLabel}>Resource Adapter harness</p>
      </div>
      <ApiHealthIndicator />
      <AccessIndicator />
      {isLoaded &&
        (isSignedIn ? (
          <>
            <Link
              aria-current={pathname === "/onboarding" ? "page" : undefined}
              className={styles.accountSetup}
              href="/onboarding"
            >
              Account setup
            </Link>
            <UserButton />
          </>
        ) : (
          <SignInButton mode="modal" />
        ))}
    </header>
  );
}
