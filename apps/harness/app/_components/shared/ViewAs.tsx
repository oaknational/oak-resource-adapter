"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import shared from "./shared.module.css";

const SIGNED_OUT = "signed-out";

export function useViewAsSignedOut(): boolean {
  return useSearchParams().get("as") === SIGNED_OUT;
}

/** Carries the signed-out preview onto another harness link. */
export function useKeepViewAs(): (href: string) => string {
  const viewAsSignedOut = useViewAsSignedOut();
  return (href) => {
    if (!viewAsSignedOut) {
      return href;
    }
    const url = new URL(href, "https://harness.invalid");
    url.searchParams.set("as", SIGNED_OUT);
    return `${url.pathname}${url.search}${url.hash}`;
  };
}

export function useViewAsHref(): (signedOut: boolean) => string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (signedOut) => {
    const parameters = new URLSearchParams(searchParams);
    if (signedOut) {
      parameters.set("as", SIGNED_OUT);
    } else {
      parameters.delete("as");
    }
    return `${pathname}?${parameters.toString()}`;
  };
}

export function ViewAsControl() {
  const { isSignedIn } = useAuth();
  const viewAsSignedOut = useViewAsSignedOut();
  const hrefFor = useViewAsHref();

  if (!isSignedIn) {
    return null;
  }

  return (
    <nav aria-label="View as" className={shared.modeSwitch}>
      <Link
        aria-current={viewAsSignedOut ? undefined : "page"}
        href={hrefFor(false)}
        scroll={false}
      >
        Signed-in view
      </Link>
      <Link
        aria-current={viewAsSignedOut ? "page" : undefined}
        href={hrefFor(true)}
        scroll={false}
      >
        Signed-out view
      </Link>
    </nav>
  );
}
