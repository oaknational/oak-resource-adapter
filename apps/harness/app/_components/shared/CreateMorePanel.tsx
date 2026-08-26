"use client";

import { ResourceAdapterButton } from "@oaknational/resource-adapter";
import { SignInButton } from "@clerk/nextjs";
import { OakPrimaryButton, OakSecondaryButton } from "@oaknational/oak-components";

import styles from "../../page.module.css";
import type { CapabilitiesState } from "../../_hooks/useCapabilities";
import type { ResourceAdapterCapabilityOption } from "@oaknational/resource-adapter";

export function CreateMorePanel<TCapability extends ResourceAdapterCapabilityOption>({
  capabilities,
  hasAvailableCapabilities,
  onSelectCapability,
  onRetry,
  state,
}: Readonly<{
  capabilities: readonly TCapability[];
  hasAvailableCapabilities: boolean;
  onSelectCapability: (capability: TCapability) => void;
  onRetry: () => void;
  state: CapabilitiesState;
}>) {
  if (capabilities.length > 0) {
    return (
      <section aria-labelledby="create-more-heading" className={styles.createMore}>
        <h2 id="create-more-heading">Create more with Aila</h2>
        <p>Use AI to adapt this lesson&apos;s available resources.</p>
        <ResourceAdapterButton
          capabilities={capabilities}
          onSelectCapability={onSelectCapability}
        />
      </section>
    );
  }

  // Nothing behind the prompt means no prompt: signing in to find an empty
  // dialog is worse than never being asked.
  if (state === "signedOut") {
    if (!hasAvailableCapabilities) {
      return null;
    }

    return (
      <section
        aria-labelledby="resource-adapter-sign-in-heading"
        className={styles.createMore}
      >
        <h2 id="resource-adapter-sign-in-heading">Sign in to create more with Aila</h2>
        <p>
          Adapting this lesson&apos;s resources with AI is available to signed-in
          teachers.
        </p>
        <SignInButton mode="modal">
          <OakPrimaryButton>Sign in</OakPrimaryButton>
        </SignInButton>
      </section>
    );
  }

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

  return null;
}
