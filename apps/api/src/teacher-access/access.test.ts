import { describe, expect, it } from "vitest";

import { teacherAccessFromMetadata } from "./access";

describe("a teacher's access tier", () => {
  it.each(["GB", "IM", "JE", "GG"])("is full for region %s", (region) => {
    expect(teacherAccessFromMetadata({ region }).tier).toBe("full");
  });

  it.each([
    ["a region outside the list", { region: "US" }],
    ["no stored region", {}],
    ["a grant that is not exactly full", { region: "US", ora: { access: true } }],
  ])("is limited for %s", (_, privateMetadata) => {
    expect(teacherAccessFromMetadata(privateMetadata).tier).toBe("limited");
  });

  it("is full for a granted teacher outside the list", () => {
    expect(
      teacherAccessFromMetadata({ region: "US", ora: { access: "full" } }).tier,
    ).toBe("full");
  });

  it("keeps the region when the ORA metadata is malformed", () => {
    expect(teacherAccessFromMetadata({ region: "GB", ora: "full" }).tier).toBe("full");
  });
});

describe("a teacher's copyright region", () => {
  it.each(["GB", "IM", "JE", "GG"])("includes region %s", (region) => {
    expect(teacherAccessFromMetadata({ region }).inCopyrightRegion).toBe(true);
  });

  it.each([
    ["a region outside the list", { region: "US" }],
    ["no stored region", {}],
    ["a granted teacher outside the list", { region: "US", ora: { access: "full" } }],
  ])("excludes %s", (_, privateMetadata) => {
    expect(teacherAccessFromMetadata(privateMetadata).inCopyrightRegion).toBe(false);
  });
});

describe("a teacher's daily limit override", () => {
  it("is read when it is a positive integer", () => {
    expect(
      teacherAccessFromMetadata({ ora: { usageLimits: { modelJobsPer24h: 250 } } })
        .modelJobsPer24h,
    ).toBe(250);
  });

  it.each([0, -1, 1.5, "250", null])("is ignored when it is %s", (modelJobsPer24h) => {
    expect(
      teacherAccessFromMetadata({
        ora: { access: "full", usageLimits: { modelJobsPer24h } },
      }),
    ).toEqual({ tier: "full", inCopyrightRegion: false });
  });

  it("ignores Aila's custom rate limit", () => {
    expect(teacherAccessFromMetadata({ customRateLimit: 500 })).toEqual({
      tier: "limited",
      inCopyrightRegion: false,
    });
  });
});
