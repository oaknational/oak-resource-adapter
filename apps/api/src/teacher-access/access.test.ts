import { describe, expect, it } from "vitest";

import { teacherAccessFromMetadata } from "./access";

describe("a teacher's access tier", () => {
  it.each(["GB", "IM", "JE", "GG"])("is full for region %s", (region) => {
    expect(teacherAccessFromMetadata({ region })).toEqual({ tier: "full" });
  });

  it.each([
    ["a region outside the list", { region: "US" }],
    ["no stored region", {}],
    ["a grant that is not exactly full", { region: "US", ora: { access: true } }],
  ])("is limited for %s", (_, privateMetadata) => {
    expect(teacherAccessFromMetadata(privateMetadata)).toEqual({ tier: "limited" });
  });

  it("is full for a granted teacher outside the list", () => {
    expect(
      teacherAccessFromMetadata({ region: "US", ora: { access: "full" } }),
    ).toEqual({ tier: "full" });
  });

  it("keeps the region when the ORA metadata is malformed", () => {
    expect(teacherAccessFromMetadata({ region: "GB", ora: "full" })).toEqual({
      tier: "full",
    });
  });
});

describe("a teacher's daily limit override", () => {
  it("is read when it is a positive integer", () => {
    expect(
      teacherAccessFromMetadata({ ora: { usageLimits: { modelJobsPer24h: 250 } } }),
    ).toEqual({ tier: "limited", modelJobsPer24h: 250 });
  });

  it.each([0, -1, 1.5, "250", null])("is ignored when it is %s", (modelJobsPer24h) => {
    expect(
      teacherAccessFromMetadata({
        ora: { access: "full", usageLimits: { modelJobsPer24h } },
      }),
    ).toEqual({ tier: "full" });
  });

  it("ignores Aila's custom rate limit", () => {
    expect(teacherAccessFromMetadata({ customRateLimit: 500 })).toEqual({
      tier: "limited",
    });
  });
});
