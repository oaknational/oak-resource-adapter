"use client";

import {
  getResourceAdapterCapabilities,
  getResourceAdapterCapabilityAvailability,
  ResourceAdapterApiError,
  type GetToken,
  type LessonContext,
  type ResourceAdapterCapabilitiesResponse,
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

type SignedInAccount = Exclude<ResourceAdapterLauncherAccount, "signedOut">;

type Loaded =
  | Readonly<{ state: "signedOut"; available: boolean }>
  | Readonly<{ state: "ready"; response: ResourceAdapterCapabilitiesResponse }>;

async function loadCapabilities({
  apiBaseUrl,
  getToken,
  lesson,
  signedOut,
}: Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
  lesson: LessonContext;
  signedOut: boolean;
}>): Promise<Loaded> {
  if (signedOut) {
    const available = await getResourceAdapterCapabilityAvailability({
      apiBaseUrl,
      lesson,
    });
    return { state: "signedOut", available };
  }
  const response = await getResourceAdapterCapabilities({
    apiBaseUrl,
    getToken,
    lesson,
  });
  return { state: "ready", response };
}

function accountFor(
  state: CapabilitiesState,
  signedInAccount: SignedInAccount | null,
): ResourceAdapterLauncherAccount | null {
  if (state === "signedOut") return "signedOut";
  return state === "ready" ? signedInAccount : null;
}

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
  const [signedInAccount, setSignedInAccount] = useState<SignedInAccount | null>(null);
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
        const loaded = await loadCapabilities({
          apiBaseUrl,
          getToken,
          lesson,
          signedOut,
        });
        if (!current) {
          return;
        }
        if (loaded.state === "signedOut") {
          setHasAvailableCapabilities(loaded.available);
        } else {
          setCapabilities(loaded.response.capabilities);
          setHasAvailableCapabilities(loaded.response.capabilities.length > 0);
          setSignedInAccount(loaded.response.account.state);
        }
        setState(loaded.state);
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
    account: accountFor(state, signedInAccount),
    capabilities,
    hasAvailableCapabilities,
    reload: () => setAttempt((value) => value + 1),
    state,
  };
}
