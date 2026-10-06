import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createAnalyticsTracker,
  type ResourceAdapterAnalyticsEvent,
} from "./analytics.js";

type EventProperty<Event> = Event extends unknown ? keyof Event : never;

/**
 * Every property any event may carry. None may carry personal data, so a new one
 * is added here only after checking what it can contain.
 */
type ReviewedProperty =
  | "attemptId"
  | "jobId"
  | "packageVersion"
  | "requestAction"
  | "retryTarget"
  | "adaptationId"
  | "capabilityId"
  | "componentType"
  | "format"
  | "jobKind"
  | "name"
  | "reviewAction"
  | "startMode"
  | "suggestionCount"
  | "supportLevel"
  | "transformationKind"
  | "transformationKinds";

describe("createAnalyticsTracker", () => {
  it("carries only reviewed properties", () => {
    expectTypeOf<
      EventProperty<ResourceAdapterAnalyticsEvent>
    >().toEqualTypeOf<ReviewedProperty>();
  });

  it("adds the capability to each event", () => {
    const onAnalyticsEvent = vi.fn();
    const track = createAnalyticsTracker(
      "worksheetScaffolding",
      onAnalyticsEvent,
      undefined,
    );

    track({
      name: "Resource Adapter Closed",
      componentType: "resource_adapter_dialog",
    });

    expect(onAnalyticsEvent).toHaveBeenCalledWith({
      capabilityId: "worksheetScaffolding",
      packageVersion: expect.any(String),
      name: "Resource Adapter Closed",
      componentType: "resource_adapter_dialog",
    });
  });

  it("reports a throwing handler as an error instead of throwing", () => {
    const error = new Error("analytics down");
    const onError = vi.fn();
    const track = createAnalyticsTracker(
      "worksheetScaffolding",
      () => {
        throw error;
      },
      onError,
    );

    expect(() =>
      track({
        name: "Resource Adapter Closed",
        componentType: "resource_adapter_dialog",
      }),
    ).not.toThrow();
    expect(onError).toHaveBeenCalledWith(error, { componentStack: null });
  });
});

it("reports rejected async handlers without an unhandled rejection", async () => {
  const error = new Error("async analytics failure");
  const onError = vi.fn();
  const track = createAnalyticsTracker(
    "worksheetScaffolding",
    async () => {
      throw error;
    },
    onError,
  );
  expect(() =>
    track({
      name: "Resource Adapter Closed",
      componentType: "resource_adapter_dialog",
    }),
  ).not.toThrow();
  await Promise.resolve();
  expect(onError).toHaveBeenCalledWith(error, { componentStack: null });
});
