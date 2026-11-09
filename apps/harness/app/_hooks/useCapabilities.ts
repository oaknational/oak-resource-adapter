"use client";

import {
  getResourceAdapterCapabilities,
  getResourceAdapterCapabilityAvailability,
  ResourceAdapterApiError,
  type LessonContext,
  type ResourceAdapterCapability,
  type ResourceAdapterLauncherAccount,
} from "@oaknational/resource-adapter";
import { useAuth } from "@clerk/nextjs";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useEffect, useState } from "react";

const log = raLogger("harness");

export type CapabilitiesState = "error" | "loading" | "ready" | "signedOut";

export type UseCapabilitiesResult = Readonly<{
  /** Null until the state is `signedOut` or `ready`. */
  account: ResourceAdapterLauncherAccount | null;
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
  const [account, setAccount] = useState<ResourceAdapterLauncherAccount | null>(null);
  const [hasAvailableCapabilities, setHasAvailableCapabilities] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    const signedOut = !isSignedIn || viewAsSignedOut;

    async function load() {
      setCapabilities([]);
      setHasAvailableCapabilities(false);
      setAccount(null);
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
            setAccount("signedOut");
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
            setAccount(response.account.state);
            setState("ready");
          }
        }
      } catch (error: unknown) {
        if (!current) {
          return;
        }
        if (error instanceof ResourceAdapterApiError && error.status === 401) {
          setAccount("signedOut");
          setState("signedOut");
          return;
        }
        log.error(error);
        if (signedOut) setAccount("signedOut");
        setState(signedOut ? "signedOut" : "error");
      }
    }

    void load();
    return () => {
      current = false;
    };
  }, [apiBaseUrl, attempt, getToken, isLoaded, isSignedIn, lesson, viewAsSignedOut]);

  return {
    account,
    capabilities,
    hasAvailableCapabilities,
    reload: () => setAttempt((value) => value + 1),
    state,
  };
}
