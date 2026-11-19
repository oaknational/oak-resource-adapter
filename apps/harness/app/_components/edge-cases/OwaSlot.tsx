import type { ReactNode } from "react";

import type { UseCapabilitiesResult } from "../../_hooks/useCapabilities";
import styles from "./OwaSlot.module.css";
import { ViewAsControl } from "../shared/ViewAs";

export type OwaSlotBadge = "Fixture" | "Live" | "Stand-in";

/** The launcher is the real package; the error panel is the harness's. */
export function owaSlotBadge({
  account,
  available,
  capabilities,
  state,
  teachingMaterials,
}: Pick<
  UseCapabilitiesResult,
  "account" | "available" | "capabilities" | "state" | "teachingMaterials"
>): OwaSlotBadge | undefined {
  if (state === "error") {
    return "Stand-in";
  }
  if (account === null) {
    return undefined;
  }
  const hasAdaptItem = account === "ready" ? capabilities.length > 0 : available;
  return hasAdaptItem || teachingMaterials.length > 0 ? "Live" : undefined;
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
            <>
              {" "}
              <span
                className={badge === "Live" ? styles.liveBadge : styles.standInBadge}
              >
                {badge}
              </span>
            </>
          )}
        </h2>
        <ViewAsControl />
      </div>
      <div className={styles.owaSlotContent}>{children}</div>
    </section>
  );
}
