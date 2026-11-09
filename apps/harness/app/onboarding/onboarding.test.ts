import { describe, expect, it } from "vitest";

import {
  NO_REGION,
  initialRegionChoice,
  isDevelopmentClerkInstance,
  onboardingOf,
  parseRegion,
  safeReturnTo,
} from "./onboarding";

describe("safeReturnTo", () => {
  it("keeps a harness path with its query and hash", () => {
    expect(safeReturnTo("/?lesson=adding-fractions&view=lessons#top")).toBe(
      "/?lesson=adding-fractions&view=lessons#top",
    );
  });

  it.each([
    ["another origin", "https://example.com/"],
    ["a protocol-relative URL", "//example.com/"],
    ["a backslash path", "/\\example.com/"],
    ["a path that normalises to protocol-relative", "/.//example.com"],
    ["a parent segment that normalises to protocol-relative", "/a/..//example.com"],
    ["a script URL", "javascript:alert(1)"],
    ["no value", undefined],
  ])("returns home for %s", (_, value) => {
    expect(safeReturnTo(value)).toBe("/");
  });
});

describe("parseRegion", () => {
  it.each(["GB", "FR"])("accepts the region code %s", (code) => {
    expect(parseRegion(code)).toBe(code);
  });

  it("reads no region as null", () => {
    expect(parseRegion(NO_REGION)).toBeNull();
  });

  it.each(["gb", "France", "", null])("rejects %s", (value) => {
    expect(() => parseRegion(value)).toThrow("Choose a region from the list.");
  });
});

describe("initialRegionChoice", () => {
  it.each([
    ["the stored region", { onboarded: true, region: "FR" }, "FR"],
    [
      "no region for a set-up account without one",
      { onboarded: true, region: null },
      NO_REGION,
    ],
    ["GB for an account that is not set up", { onboarded: false, region: null }, "GB"],
    ["a region Aila stored before setup", { onboarded: false, region: "US" }, "US"],
  ])("keeps %s", (_, account, expected) => {
    expect(initialRegionChoice(account)).toBe(expected);
  });
});

describe("isDevelopmentClerkInstance", () => {
  it.each([
    ["sk_test_abc", true],
    ["sk_live_abc", false],
    [undefined, false],
  ])("is %s for %s", (secretKey, expected) => {
    expect(isDevelopmentClerkInstance(secretKey)).toBe(expected);
  });
});

describe("onboardingOf", () => {
  it("reads OWA's flag and the region", () => {
    expect(
      onboardingOf({
        publicMetadata: { owa: { isOnboarded: true } },
        privateMetadata: { region: "GB" },
      }),
    ).toEqual({ onboarded: true, region: "GB" });
  });

  it("treats missing metadata as not set up", () => {
    expect(onboardingOf({ publicMetadata: {}, privateMetadata: {} })).toEqual({
      onboarded: false,
      region: null,
    });
  });
});
