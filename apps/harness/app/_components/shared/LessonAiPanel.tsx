"use client";

import {
  ResourceAdapterLauncher,
  type ResourceAdapterCapabilityOption,
  type ResourceAdapterLauncherProps,
} from "@oaknational/resource-adapter";
import { OakSecondaryButton } from "@oaknational/oak-components";

import styles from "./LessonAiPanel.module.css";
import type { UseCapabilitiesResult } from "../../_hooks/useCapabilities";

export function LessonAiPanel<TCapability extends ResourceAdapterCapabilityOption>({
  account,
  onRetry,
  state,
  ...launcher
}: Omit<ResourceAdapterLauncherProps<TCapability>, "account"> &
  Pick<UseCapabilitiesResult, "account" | "state"> &
  Readonly<{ onRetry: () => void }>) {
  if (state === "error") {
    return (
      <section
        aria-labelledby="resource-adapter-unavailable-heading"
        className={styles.panel}
      >
        <h2 id="resource-adapter-unavailable-heading">Adapt with AI is unavailable</h2>
        <p>The harness could not load Resource Adapter capabilities.</p>
        <OakSecondaryButton onClick={onRetry}>Try again</OakSecondaryButton>
      </section>
    );
  }

  if (account === null) {
    return null;
  }

  // Bare on purpose: this panel shows only what OWA itself renders, so any harness
  // framing belongs to the page that wants it.
  return <ResourceAdapterLauncher account={account} {...launcher} />;
}
