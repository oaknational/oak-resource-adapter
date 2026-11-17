"use client";

import {
  getResourceAdapterCapabilities,
  getResourceAdapterCapabilityAvailability,
  ResourceAdapterApiError,
  type GetToken,
  type LessonContext,
  type ResourceAdapterCapabilitiesResponse,
  type ResourceAdapterCapability,
  type ResourceAdapterCapabilityAvailability,
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
  available: boolean;
  /** Null unless a signed-in account is ready. */
  inCopyrightRegion: boolean | null;
  reload: () => void;
  state: CapabilitiesState;
  teachingMaterials: ResourceAdapterCapabilityAvailability["teachingMaterials"];
}>;

const noAvailability: ResourceAdapterCapabilityAvailability = {
  available: false,
  teachingMaterials: [],
};

type SignedInAccount = Exclude<ResourceAdapterLauncherAccount, "signedOut">;

type Loaded =
  | Readonly<{
      state: "signedOut";
      availability: ResourceAdapterCapabilityAvailability;
    }>
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
    const availability = await getResourceAdapterCapabilityAvailability({
      apiBaseUrl,
      lesson,
    });
    return { state: "signedOut", availability };
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
  const [availability, setAvailability] =
    useState<ResourceAdapterCapabilityAvailability>(noAvailability);
  const [inCopyrightRegion, setInCopyrightRegion] = useState<boolean | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    const signedOut = !isSignedIn || viewAsSignedOut;

    async function load() {
      setCapabilities([]);
      setAvailability(noAvailability);
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
          setAvailability(loaded.availability);
        } else {
          setCapabilities(loaded.response.capabilities);
          setAvailability(loaded.response);
          setSignedInAccount(loaded.response.account.state);
          setInCopyrightRegion(
            loaded.response.account.state === "ready"
              ? loaded.response.account.inCopyrightRegion
              : null,
          );
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
    available: availability.available,
    capabilities,
    inCopyrightRegion: state === "ready" ? inCopyrightRegion : null,
    reload: () => setAttempt((value) => value + 1),
    state,
    teachingMaterials: availability.teachingMaterials,
  };
}
