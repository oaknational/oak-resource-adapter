"use client";

import { useAuth } from "@clerk/nextjs";
import { raLogger } from "@oaknational/resource-adapter-logger";
import posthog from "posthog-js";
import { useEffect } from "react";

import { createHarnessAnalytics } from "../_analytics/analytics";

const analytics = createHarnessAnalytics(posthog, {
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_API_KEY ?? "",
  environment: process.env.ANALYTICS_ENVIRONMENT ?? "local",
  release: process.env.ANALYTICS_RELEASE ?? "local",
  isAutomated: () => typeof navigator !== "undefined" && navigator.webdriver === true,
});

export function useHarnessAnalyticsIdentity() {
  const { userId } = useAuth();
  useEffect(() => {
    try {
      analytics.identify(userId);
    } catch (error) {
      raLogger("harness").error(error);
    }
  }, [userId]);
}

export function useHarnessAnalytics() {
  return {
    trackAnalyticsEvent: analytics.capture,
    trackAdapterOpened: analytics.captureOpened,
  };
}
