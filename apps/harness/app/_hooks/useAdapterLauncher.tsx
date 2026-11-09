"use client";

import {
  ResourceAdapterDialog,
  type LessonContext,
  type ResourceAdapterCapability,
  type ResourceAdapterOpeningControl,
} from "@oaknational/resource-adapter";
import { useAuth, useClerk } from "@clerk/nextjs";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useViewAsHref, useViewAsSignedOut } from "../_components/shared/ViewAs";
import { useCapabilities } from "./useCapabilities";
import { useHarnessAnalytics } from "./useHarnessAnalytics";

const log = raLogger("harness");

export function useAdapterLauncher({
  apiBaseUrl,
  lesson,
  resetKey,
}: Readonly<{ apiBaseUrl: string; lesson: LessonContext; resetKey: string }>) {
  const { getToken, isSignedIn } = useAuth();
  const { trackAnalyticsEvent, trackAdapterOpened } = useHarnessAnalytics();
  const { openSignIn } = useClerk();
  const router = useRouter();
  const viewAsSignedOut = useViewAsSignedOut();
  const signedInHref = useViewAsHref()(false);
  const onboardingHref = `/onboarding?returnTo=${encodeURIComponent(signedInHref)}`;
  const capabilities = useCapabilities({ apiBaseUrl, lesson, viewAsSignedOut });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCapability, setSelectedCapability] = useState<
    ResourceAdapterCapability | undefined
  >();

  useEffect(() => {
    setIsDialogOpen(false);
    setSelectedCapability(undefined);
  }, [resetKey, viewAsSignedOut, isSignedIn]);

  function selectCapability(
    capability: ResourceAdapterCapability,
    control: ResourceAdapterOpeningControl,
  ) {
    setSelectedCapability(capability);
    setIsDialogOpen(true);
    trackAdapterOpened(capability.id, control);
  }

  function finishSetup() {
    router.push(onboardingHref);
  }

  // Through the stand-in onboarding, as OWA sends sign-in through its own. It
  // returns an onboarded teacher straight away.
  function signIn() {
    if (isSignedIn) {
      finishSetup();
      return;
    }
    if (viewAsSignedOut) {
      router.push(signedInHref, { scroll: false });
    }
    openSignIn({
      forceRedirectUrl: onboardingHref,
      signUpForceRedirectUrl: onboardingHref,
    });
  }

  const dialog =
    selectedCapability && isSignedIn && !viewAsSignedOut ? (
      <ResourceAdapterDialog
        apiBaseUrl={apiBaseUrl}
        capability={selectedCapability}
        getToken={getToken}
        isOpen={isDialogOpen}
        lesson={lesson}
        onAnalyticsEvent={trackAnalyticsEvent}
        onClose={() => setIsDialogOpen(false)}
        onError={(error) => log.error(error)}
        onFinishSetup={finishSetup}
      />
    ) : null;

  return {
    ...capabilities,
    dialog,
    finishSetup,
    selectCapability,
    signIn,
  };
}
