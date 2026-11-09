"use client";

import { useEffect, useId, useState } from "react";
import {
  OakFlex,
  OakHeading,
  OakP,
  OakPrimaryButton,
} from "@oaknational/oak-components";
import type { ResourceAdapterAccount } from "@oaknational/resource-adapter-contracts";

import {
  forgetOnboardingTrip,
  rememberOnboardingTrip,
  wasOnboardingTripFrom,
  type OnboardingTripLesson,
} from "./onboardingTrip.js";
import {
  ResourceAdapterButton,
  type ResourceAdapterButtonProps,
  type ResourceAdapterCapabilityOption,
} from "./ResourceAdapterButton.js";

export type ResourceAdapterLauncherAccount =
  "signedOut" | ResourceAdapterAccount["state"];

export type ResourceAdapterLauncherProps<
  TCapability extends ResourceAdapterCapabilityOption = ResourceAdapterCapabilityOption,
> = ResourceAdapterButtonProps<TCapability> &
  Readonly<{
    account: ResourceAdapterLauncherAccount;
    lesson: OnboardingTripLesson;
    /** Must bring the teacher back to this lesson, through onboarding if needed. */
    onSignIn: () => void;
    /** Must send the teacher to onboarding and back to this lesson. */
    onFinishSetup: () => void;
  }>;

const PROMPTS = {
  signedOut: {
    action: "Sign in",
    heading: "Sign in to create more with Aila",
    message: "You can adapt this lesson's resources with AI once you're signed in.",
  },
  needsSetup: {
    action: "Finish setup",
    heading: "Finish setting up your account",
    message:
      "Add a few details about yourself, then you can adapt this lesson's resources with AI.",
  },
  setupIncomplete: {
    action: "Try again",
    heading: "Your account setup isn't finished",
    message: "Finish setting up your account to adapt this lesson's resources with AI.",
  },
} as const;

/**
 * The lesson-page entry point for every account state: a prompt to sign in or
 * finish setting up, or the capability button once the teacher is ready.
 */
export function ResourceAdapterLauncher<
  TCapability extends ResourceAdapterCapabilityOption,
>({
  account,
  capabilities,
  lesson,
  onFinishSetup,
  onSelectCapability,
  onSignIn,
}: ResourceAdapterLauncherProps<TCapability>) {
  const { lessonSlug, programmeSlug } = lesson;
  const [arrival, setArrival] = useState<Readonly<
    { account: ResourceAdapterLauncherAccount } & OnboardingTripLesson
  > | null>(null);
  // Read after render, so server and browser markup match. Left alone while signed
  // out, because a host can remount the launcher before sign-in finishes.
  useEffect(() => {
    if (
      account === "signedOut" ||
      !wasOnboardingTripFrom({ lessonSlug, programmeSlug })
    ) {
      return;
    }
    forgetOnboardingTrip();
    setArrival({ account, lessonSlug, programmeSlug });
  }, [account, lessonSlug, programmeSlug]);
  const headingId = useId();
  const returned =
    arrival?.account === account &&
    arrival.lessonSlug === lessonSlug &&
    arrival.programmeSlug === programmeSlug;

  if (account === "ready") {
    const button = (
      <ResourceAdapterButton
        capabilities={capabilities}
        onSelectCapability={onSelectCapability}
      />
    );
    if (capabilities.length === 0 || !returned) {
      return button;
    }
    return (
      <OakFlex $alignItems="flex-start" $flexDirection="column" $gap="spacing-8">
        <OakP $font="body-2" role="status">
          Your account is ready. Adapt this lesson&apos;s resources below.
        </OakP>
        {button}
      </OakFlex>
    );
  }

  let prompt: (typeof PROMPTS)[keyof typeof PROMPTS] = PROMPTS.signedOut;
  if (account === "needsSetup") {
    prompt = returned ? PROMPTS.setupIncomplete : PROMPTS.needsSetup;
  }
  const leave = account === "signedOut" ? onSignIn : onFinishSetup;

  return (
    <section aria-labelledby={headingId}>
      <OakFlex $alignItems="flex-start" $flexDirection="column" $gap="spacing-8">
        <OakHeading $font="heading-6" id={headingId} tag="h2">
          {prompt.heading}
        </OakHeading>
        <OakP $font="body-2">{prompt.message}</OakP>
        <OakPrimaryButton
          onClick={() => {
            rememberOnboardingTrip(lesson);
            leave();
          }}
        >
          {prompt.action}
        </OakPrimaryButton>
      </OakFlex>
    </section>
  );
}
