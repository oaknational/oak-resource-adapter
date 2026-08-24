"use client";

import {
  getResourceAdapterCapabilities,
  getResourceAdapterCapabilityAvailability,
  ResourceAdapterApiError,
  type LessonContext,
  type ResourceAdapterCapability,
} from "@oaknational/resource-adapter";
import { useAuth } from "@clerk/nextjs";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useCallback, useEffect, useState } from "react";

const log = raLogger("harness");

export type CapabilitiesState = "error" | "loading" | "ready" | "signedOut";

export type UseCapabilitiesResult = Readonly<{
  capabilities: readonly ResourceAdapterCapability[];
  /** Set while signed out too, when `capabilities` cannot be read. */
  hasAvailableCapabilities: boolean;
  reload: () => void;
  state: CapabilitiesState;
}>;

export function useCapabilities({
  apiBaseUrl,
  lesson,
}: Readonly<{
  apiBaseUrl: string;
  lesson: LessonContext;
}>): UseCapabilitiesResult {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [capabilities, setCapabilities] = useState<
    readonly ResourceAdapterCapability[]
  >([]);
  const [state, setState] = useState<CapabilitiesState>("loading");
  const [hasAvailableCapabilities, setHasAvailableCapabilities] = useState(false);

  const load = useCallback(async () => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setCapabilities([]);

      try {
        setHasAvailableCapabilities(
          await getResourceAdapterCapabilityAvailability({ apiBaseUrl, lesson }),
        );
      } catch (error: unknown) {
        // A prompt promising something we cannot confirm is worse than none.
        setHasAvailableCapabilities(false);
        log.error(error);
      }

      setState("signedOut");
      return;
    }

    setState("loading");
    log.info("Loading capabilities for lesson %s", lesson.lessonSlug);

    try {
      const response = await getResourceAdapterCapabilities({
        apiBaseUrl,
        getToken,
        lesson,
      });

      setCapabilities(response.capabilities);
      setHasAvailableCapabilities(response.capabilities.length > 0);
      setState("ready");
      log.info("Loaded %d capabilities", response.capabilities.length);
    } catch (error: unknown) {
      setCapabilities([]);

      if (error instanceof ResourceAdapterApiError && error.status === 401) {
        setState("signedOut");
        return;
      }

      setHasAvailableCapabilities(false);

      log.error(error);
      setState("error");
    }
  }, [apiBaseUrl, getToken, isLoaded, isSignedIn, lesson]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    capabilities,
    hasAvailableCapabilities,
    reload: () => void load(),
    state,
  };
}
