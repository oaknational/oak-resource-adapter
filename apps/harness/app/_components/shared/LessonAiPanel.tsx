"use client";

import {
  ResourceAdapterLauncher,
  type ResourceAdapterCapabilityOption,
  type ResourceAdapterLauncherProps,
} from "@oaknational/resource-adapter";
import {
  OakFlex,
  OakHeading,
  OakP,
  OakSecondaryButton,
} from "@oaknational/oak-components";

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
      <OakFlex
        $alignItems="flex-start"
        $flexDirection="column"
        $gap="spacing-8"
        aria-labelledby="resource-adapter-unavailable-heading"
        as="section"
      >
        <OakHeading
          $font="heading-6"
          id="resource-adapter-unavailable-heading"
          tag="h2"
        >
          Adapt with AI is unavailable
        </OakHeading>
        <OakP $mb="spacing-8">
          The harness could not load Resource Adapter capabilities.
        </OakP>
        <OakSecondaryButton onClick={onRetry}>Try again</OakSecondaryButton>
      </OakFlex>
    );
  }

  if (account === null) {
    return null;
  }

  // Bare on purpose: this panel shows only what OWA itself renders, so any harness
  // framing belongs to the page that wants it.
  return <ResourceAdapterLauncher account={account} {...launcher} />;
}
