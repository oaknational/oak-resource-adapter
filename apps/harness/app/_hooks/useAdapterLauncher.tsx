"use client";

import {
  ResourceAdapterDialog,
  type LessonContext,
  type ResourceAdapterCapability,
  type ResourceAdapterOpeningControl,
} from "@oaknational/resource-adapter";
import { useAuth } from "@clerk/nextjs";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useEffect, useState } from "react";

import {
  useExitSignedOutPreview,
  useViewAsSignedOut,
} from "../_components/shared/ViewAs";
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
  const viewAsSignedOut = useViewAsSignedOut();
  const exitSignedOutPreview = useExitSignedOutPreview();
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
      />
    ) : null;

  return {
    ...capabilities,
    dialog,
    exitSignedOutPreview,
    selectCapability,
  };
}
