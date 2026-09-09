"use client";

import { useEffect, useState } from "react";

import { fetchApiHealth, fetchApiReadiness } from "../harness-api";
import type { ApiReadiness } from "../harness-api";

type LivenessState = "checking" | "healthy" | "unavailable";
type ReadinessState = { status: "checking" | "unavailable" } | ApiReadiness;

export function useApiHealth() {
  const [liveness, setLiveness] = useState<LivenessState>("checking");
  const [readiness, setReadiness] = useState<ReadinessState>({ status: "checking" });

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const live = fetchApiHealth(controller.signal)
      .then((isHealthy) => {
        if (isMounted) {
          setLiveness(isHealthy ? "healthy" : "unavailable");
        }
      })
      .catch(() => {
        if (isMounted) {
          setLiveness("unavailable");
        }
      });
    const ready = fetchApiReadiness(controller.signal)
      .then((result) => {
        if (isMounted) {
          setReadiness(result);
        }
      })
      .catch(() => {
        if (isMounted) {
          setReadiness({ status: "unavailable" });
        }
      });

    void Promise.all([live, ready]).then(() => clearTimeout(timeout));

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return { liveness, readiness };
}
