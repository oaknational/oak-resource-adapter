import type { ResourceAdapterAnalyticsEvent } from "@oaknational/resource-adapter";
import type { PostHog } from "posthog-js";
import { describe, expect, it, vi } from "vitest";

import { createHarnessAnalytics, toPostHogProperties } from "./analytics";

const event: ResourceAdapterAnalyticsEvent = {
  name: "Transformation Requested",
  adaptationId: "adaptation-1",
  capabilityId: "worksheetScaffolding",
  componentType: "suggestion_button",
  packageVersion: "0.1.0",
  transformationKind: "scaffold-add-word-bank",
};

function setup(apiKey = "phc_test") {
  const client = {
    init: vi.fn<PostHog["init"]>(),
    capture: vi.fn<PostHog["capture"]>(),
    identify: vi.fn<PostHog["identify"]>(),
    reset: vi.fn<PostHog["reset"]>(),
  };
  const isAutomated = vi.fn(() => false);
  const analytics = createHarnessAnalytics(client, {
    apiKey,
    environment: "staging",
    release: "commit-123",
    isAutomated,
  });
  return { client, analytics, isAutomated };
}

describe("harness analytics", () => {
  it.each(["resource_adapter_button", "resource_adapter_menu_item"] as const)(
    "sends the host-owned opening event from %s through the existing sender",
    (componentType) => {
      const { client, analytics } = setup();
      analytics.captureOpened("worksheetScaffolding", componentType);
      expect(client.capture).toHaveBeenCalledExactlyOnceWith(
        "Resource Adapter Opened",
        {
          "Analytics Use Case": "Teacher",
          "Capability Id": "worksheetScaffolding",
          "Component Type": componentType,
          "Engagement Intent": "explore",
          "Event Version": "2.0.0",
          Platform: "harness",
          Product: "resource adapter",
        },
      );
    },
  );

  it("uses Oak destination property names and core properties", () => {
    expect(toPostHogProperties(event)).toEqual({
      "Adaptation Id": "adaptation-1",
      "Analytics Use Case": "Teacher",
      "Capability Id": "worksheetScaffolding",
      "Component Type": "suggestion_button",
      "Engagement Intent": "use",
      "Event Version": "2.0.0",
      "Package Version": "0.1.0",
      Platform: "harness",
      Product: "resource adapter",
      "Transformation Kind": "scaffold-add-word-bank",
    });
    expect(
      toPostHogProperties({ ...event, ...{ unexpectedText: "private text" } }),
    ).not.toHaveProperty("unexpectedText");
  });

  it("sends nothing and does not initialise without a key", () => {
    const { client, analytics } = setup("");
    analytics.identify("teacher-1");
    analytics.capture(event);
    analytics.captureOpened("worksheetScaffolding", "resource_adapter_button");
    expect(client.init).not.toHaveBeenCalled();
    expect(client.identify).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
  });

  it("contains an opening-event failure so the launcher can still open the dialog", () => {
    const { client, analytics } = setup();
    const error = new Error("analytics unavailable");
    const reportError = vi.spyOn(console, "error").mockImplementation(() => {});
    client.capture.mockImplementation(() => {
      throw error;
    });
    try {
      expect(() =>
        analytics.captureOpened("worksheetScaffolding", "resource_adapter_button"),
      ).not.toThrow();
      expect(reportError).toHaveBeenCalledWith(error);
    } finally {
      reportError.mockRestore();
    }
  });

  it("initialises once, with automatic content capture disabled", () => {
    const { client, analytics } = setup();
    analytics.identify("teacher-1");
    analytics.capture(event);
    analytics.capture(event);
    expect(client.init).toHaveBeenCalledOnce();
    expect(client.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        autocapture: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        capture_heatmaps: false,
        capture_performance: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        opt_out_useragent_filter: true,
      }),
    );
    expect(client.capture).toHaveBeenCalledWith(event.name, toPostHogProperties(event));
  });

  it("adds environment and release to SDK events and tags automation at send time", () => {
    const { client, analytics, isAutomated } = setup();
    analytics.identify("teacher-1");
    const beforeSend = client.init.mock.calls[0]?.[1]?.before_send;
    if (typeof beforeSend !== "function") throw new Error("Missing before_send");
    const sdkEvent = {
      uuid: "event-1",
      event: "$identify",
      properties: { distinct_id: "teacher-1" },
    };
    expect(beforeSend(sdkEvent)?.properties).toMatchObject({
      Environment: "staging",
      Release: "commit-123",
      "Automated Run": false,
    });
    isAutomated.mockReturnValue(true);
    expect(beforeSend(sdkEvent)?.properties).toMatchObject({ "Automated Run": true });
    expect(beforeSend(null)).toBeNull();
  });

  it("waits for auth and resets between teachers and on logout", () => {
    const { client, analytics } = setup();
    analytics.identify(undefined);
    expect(client.init).not.toHaveBeenCalled();
    analytics.identify("teacher-1");
    analytics.identify("teacher-1");
    expect(client.identify).toHaveBeenCalledOnce();
    analytics.identify("teacher-2");
    expect(client.reset).toHaveBeenCalledOnce();
    analytics.identify(null);
    expect(client.reset).toHaveBeenCalledTimes(2);
    analytics.identify(null);
    expect(client.reset).toHaveBeenCalledTimes(2);
  });

  it("clears persisted identity when the first auth state is signed out", () => {
    const { client, analytics } = setup();
    analytics.identify(null);
    expect(client.reset).toHaveBeenCalledOnce();
  });
});
