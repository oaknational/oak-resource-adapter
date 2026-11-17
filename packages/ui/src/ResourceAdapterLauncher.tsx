"use client";

import { useEffect, useMemo, useState } from "react";
import { OakFlex, OakP } from "@oaknational/oak-components";
import type { ResourceAdapterAccount } from "@oaknational/resource-adapter-contracts";

import {
  createLessonAiMenuTracker,
  type LessonAiMenuAnalyticsHandler,
} from "./analytics.js";
import { LessonAiMenu, type LessonAiMenuItem } from "./LessonAiMenu.js";
import {
  forgetOnboardingTrip,
  rememberOnboardingTrip,
  wasOnboardingTripFrom,
  type OnboardingTripLesson,
} from "./onboardingTrip.js";
import type {
  ResourceAdapterCapabilityId,
  ResourceAdapterErrorHandler,
} from "./publicTypes.js";
import type { ResourceAdapterTeachingMaterialId } from "./teachingMaterials.js";

export type ResourceAdapterLauncherAccount =
  "signedOut" | ResourceAdapterAccount["state"];

export type ResourceAdapterCapabilityOption = Readonly<{
  id: ResourceAdapterCapabilityId;
  label: string;
}>;

export type ResourceAdapterLauncherProps<
  TCapability extends ResourceAdapterCapabilityOption = ResourceAdapterCapabilityOption,
> = Readonly<{
  account: ResourceAdapterLauncherAccount;
  /**
   * Whether ORA has anything for the lesson once the teacher is signed in and set
   * up: from the availability response when signed out, the capabilities response
   * otherwise. Not read for a ready account.
   */
  available: boolean;
  capabilities: readonly TCapability[];
  lesson: OnboardingTripLesson;
  onAnalyticsEvent?: LessonAiMenuAnalyticsHandler;
  onError?: ResourceAdapterErrorHandler;
  /** Must send the teacher to onboarding and back to this lesson. */
  onFinishSetup: () => void;
  onSelectCapability: (capability: TCapability) => void;
  /** Must bring the teacher back to this lesson, through onboarding if needed. */
  onSignIn: () => void;
  teachingMaterials: readonly ResourceAdapterTeachingMaterialId[];
}>;

/** The lesson-page entry point for every account state. */
export function ResourceAdapterLauncher<
  TCapability extends ResourceAdapterCapabilityOption,
>({
  account,
  available,
  capabilities,
  lesson,
  onAnalyticsEvent,
  onError,
  onFinishSetup,
  onSelectCapability,
  onSignIn,
  teachingMaterials,
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
  const track = useMemo(
    () => createLessonAiMenuTracker(onAnalyticsEvent, onError),
    [onAnalyticsEvent, onError],
  );

  let adaptItems: readonly LessonAiMenuItem[] = [];
  if (account === "ready") {
    adaptItems = capabilities.map((capability) => ({
      key: capability.id,
      label: capability.label,
      onSelect: () => {
        track({
          name: "Resource Adapter Opened",
          componentType: "lesson_ai_menu_item",
          capabilityId: capability.id,
        });
        onSelectCapability(capability);
      },
    }));
  } else if (available) {
    const leave = account === "signedOut" ? onSignIn : onFinishSetup;
    adaptItems = [
      {
        key: account,
        label: account === "signedOut" ? "Sign in to adapt" : "Finish setup to adapt",
        onSelect: () => {
          track({
            name: "Adapt Onboarding Selected",
            componentType: "lesson_ai_menu_item",
            accountState: account,
          });
          rememberOnboardingTrip(lesson);
          leave();
        },
      },
    ];
  }

  const menu = (
    <LessonAiMenu
      adaptItems={adaptItems}
      lesson={lesson}
      teachingMaterials={teachingMaterials}
      track={track}
    />
  );
  const returnedReady =
    account === "ready" &&
    arrival?.account === account &&
    arrival.lessonSlug === lessonSlug &&
    arrival.programmeSlug === programmeSlug;
  if (!returnedReady || capabilities.length === 0) {
    return menu;
  }
  return (
    <OakFlex $alignItems="flex-start" $flexDirection="column" $gap="spacing-8">
      <OakP $font="body-2" role="status">
        Your account is ready. Adapt this lesson&apos;s resources below.
      </OakP>
      {menu}
    </OakFlex>
  );
}
