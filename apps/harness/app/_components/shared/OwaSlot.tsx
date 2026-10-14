import type { ReactNode } from "react";

import type { CapabilitiesState } from "../../_hooks/useCapabilities";
import styles from "../../page.module.css";
import { ViewAsControl } from "./ViewAs";

export type OwaSlotBadge = "Fixture" | "Live" | "Stand-in";

/** The launcher is the real package; the sign-in and error panels are the harness's. */
export function owaSlotBadge(
  state: CapabilitiesState,
  capabilityCount: number,
): OwaSlotBadge | undefined {
  if (capabilityCount > 0) {
    return "Live";
  }
  return state === "signedOut" || state === "error" ? "Stand-in" : undefined;
}

export function OwaSlot({
  badge,
  children,
}: Readonly<{ badge: OwaSlotBadge | undefined; children: ReactNode }>) {
  return (
    <section aria-labelledby="teachers-see-heading" className={styles.owaSlot}>
      <div className={styles.owaSlotHeader}>
        <h2 id="teachers-see-heading">
          What teachers see in OWA
          {badge === undefined ? null : (
            <span className={badge === "Live" ? styles.liveBadge : styles.standInBadge}>
              {badge}
            </span>
          )}
        </h2>
        <ViewAsControl />
      </div>
      <div className={styles.owaSlotContent}>{children}</div>
    </section>
  );
}
