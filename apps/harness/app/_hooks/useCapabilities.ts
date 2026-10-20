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
import { useEffect, useState } from "react";

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
  viewAsSignedOut = false,
}: Readonly<{
  apiBaseUrl: string;
  lesson: LessonContext;
  viewAsSignedOut?: boolean;
}>): UseCapabilitiesResult {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [capabilities, setCapabilities] = useState<
    readonly ResourceAdapterCapability[]
  >([]);
  const [state, setState] = useState<CapabilitiesState>("loading");
  const [hasAvailableCapabilities, setHasAvailableCapabilities] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    const signedOut = !isSignedIn || viewAsSignedOut;

    async function load() {
      setCapabilities([]);
      setHasAvailableCapabilities(false);
      setState("loading");

      if (!isLoaded) {
        return;
      }

      try {
        if (signedOut) {
          const available = await getResourceAdapterCapabilityAvailability({
            apiBaseUrl,
            lesson,
          });
          if (current) {
            setHasAvailableCapabilities(available);
            setState("signedOut");
          }
        } else {
          const response = await getResourceAdapterCapabilities({
            apiBaseUrl,
            getToken,
            lesson,
          });
          if (current) {
            setCapabilities(response.capabilities);
            setHasAvailableCapabilities(response.capabilities.length > 0);
            setState("ready");
          }
        }
      } catch (error: unknown) {
        if (!current) {
          return;
        }
        if (error instanceof ResourceAdapterApiError && error.status === 401) {
          setState("signedOut");
          return;
        }
        log.error(error);
        setState(signedOut ? "signedOut" : "error");
      }
    }

    void load();
    return () => {
      current = false;
    };
  }, [apiBaseUrl, attempt, getToken, isLoaded, isSignedIn, lesson, viewAsSignedOut]);

  return {
    capabilities,
    hasAvailableCapabilities,
    reload: () => setAttempt((value) => value + 1),
    state,
  };
}
