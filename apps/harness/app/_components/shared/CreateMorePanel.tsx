"use client";

import {
  ResourceAdapterLauncher,
  type ResourceAdapterCapabilityOption,
  type ResourceAdapterLauncherProps,
} from "@oaknational/resource-adapter";
import { OakSecondaryButton } from "@oaknational/oak-components";

import styles from "./CreateMorePanel.module.css";
import type { UseCapabilitiesResult } from "../../_hooks/useCapabilities";

export function CreateMorePanel<TCapability extends ResourceAdapterCapabilityOption>({
  account,
  hasAvailableCapabilities,
  onRetry,
  state,
  ...launcher
}: Omit<ResourceAdapterLauncherProps<TCapability>, "account"> &
  Pick<UseCapabilitiesResult, "account" | "hasAvailableCapabilities" | "state"> &
  Readonly<{ onRetry: () => void }>) {
  if (state === "error") {
    return (
      <section
        aria-labelledby="resource-adapter-unavailable-heading"
        className={styles.createMore}
      >
        <h2 id="resource-adapter-unavailable-heading">
          Create more with Aila is unavailable
        </h2>
        <p>The harness could not load Resource Adapter capabilities.</p>
        <OakSecondaryButton onClick={onRetry}>Try again</OakSecondaryButton>
      </section>
    );
  }

  // Nothing behind the prompt means no prompt: signing in to find an empty
  // dialog is worse than never being asked.
  if (account === null || (account === "signedOut" && !hasAvailableCapabilities)) {
    return null;
  }

  // Bare on purpose: this panel shows only what OWA itself renders, so any harness
  // framing belongs to the page that wants it.
  return <ResourceAdapterLauncher account={account} {...launcher} />;
}
