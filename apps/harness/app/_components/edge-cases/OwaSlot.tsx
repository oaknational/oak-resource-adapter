import type { ReactNode } from "react";

import type { UseCapabilitiesResult } from "../../_hooks/useCapabilities";
import styles from "./OwaSlot.module.css";
import { ViewAsControl } from "../shared/ViewAs";

export type OwaSlotBadge = "Fixture" | "Live" | "Stand-in";

/** The launcher, its prompts included, is the real package; the error panel is the harness's. */
export function owaSlotBadge({
  account,
  capabilities,
  hasAvailableCapabilities,
  state,
}: Pick<
  UseCapabilitiesResult,
  "account" | "capabilities" | "hasAvailableCapabilities" | "state"
>): OwaSlotBadge | undefined {
  if (state === "error") {
    return "Stand-in";
  }
  const showsPrompt =
    account === "needsSetup" || (account === "signedOut" && hasAvailableCapabilities);
  return showsPrompt || capabilities.length > 0 ? "Live" : undefined;
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
