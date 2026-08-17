"use client";

import { useEffect, useState } from "react";

import { fetchApiHealth } from "../harness-api";

export type ApiHealthState = "checking" | "healthy" | "unavailable";

export function useApiHealth(): ApiHealthState {
  const [apiHealthState, setApiHealthState] = useState<ApiHealthState>("checking");

  useEffect(() => {
    let isMounted = true;

    async function loadHealth() {
      try {
        const isHealthy = await fetchApiHealth();

        if (isMounted) {
          setApiHealthState(isHealthy ? "healthy" : "unavailable");
        }
      } catch {
        if (isMounted) {
          setApiHealthState("unavailable");
        }
      }
    }

    void loadHealth();

    return () => {
      isMounted = false;
    };
  }, []);

  return apiHealthState;
}
