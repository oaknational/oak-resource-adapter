import { describe, expect, it } from "vitest";

import {
  OAK_MODEL_JOBS_PER_24H,
  RATE_LIMIT_ME_MODEL_JOBS_PER_24H,
  teacherAccessFromClerkUser,
} from "./access";

type EmailAddress = Parameters<
  typeof teacherAccessFromClerkUser
>[0]["emailAddresses"][number];

const verified = (emailAddress: string): EmailAddress => ({
  emailAddress,
  verification: { status: "verified" },
});

const unverified = (emailAddress: string): EmailAddress => ({
  emailAddress,
  verification: { status: "unverified" },
});

const accessFor = (privateMetadata: unknown, ...emailAddresses: EmailAddress[]) =>
  teacherAccessFromClerkUser({ privateMetadata, emailAddresses });

const oak = "teacher@thenational.academy";
const accessLimitMe = "teacher+access-limit-me@thenational.academy";
const rateLimitMe = "teacher+rate-limit-me@thenational.academy";

describe("a teacher's access tier", () => {
  it.each(["GB", "IM", "JE", "GG"])("is full for region %s", (region) => {
    expect(accessFor({ region }).tier).toBe("full");
  });

  it.each([
    ["a region outside the list", { region: "US" }],
    ["no stored region", {}],
    ["a grant that is not exactly full", { region: "US", ora: { access: true } }],
  ])("is limited for %s", (_, privateMetadata) => {
    expect(accessFor(privateMetadata).tier).toBe("limited");
  });

  it("is full for a granted teacher outside the list", () => {
    expect(accessFor({ region: "US", ora: { access: "full" } }).tier).toBe("full");
  });

  it("keeps the region when the ORA metadata is malformed", () => {
    expect(accessFor({ region: "GB", ora: "full" }).tier).toBe("full");
  });
});

describe("a teacher's copyright region", () => {
  it.each(["GB", "IM", "JE", "GG"])("includes region %s", (region) => {
    expect(accessFor({ region }).inCopyrightRegion).toBe(true);
  });

  it.each([
    ["a region outside the list", { region: "US" }],
    ["no stored region", {}],
    ["a granted teacher outside the list", { region: "US", ora: { access: "full" } }],
  ])("excludes %s", (_, privateMetadata) => {
    expect(accessFor(privateMetadata).inCopyrightRegion).toBe(false);
  });
});

describe("a teacher's daily limit override", () => {
  it("is read when it is a positive integer", () => {
    expect(
      accessFor({ ora: { usageLimits: { modelJobsPer24h: 250 } } }).modelJobsPer24h,
    ).toBe(250);
  });

  it.each([0, -1, 1.5, "250", null])("is ignored when it is %s", (modelJobsPer24h) => {
    expect(
      accessFor({ ora: { access: "full", usageLimits: { modelJobsPer24h } } }),
    ).toEqual({ tier: "full", inCopyrightRegion: false });
  });

  it("ignores Aila's custom rate limit", () => {
    expect(accessFor({ customRateLimit: 500 })).toEqual({
      tier: "limited",
      inCopyrightRegion: false,
    });
  });
});

describe("a verified Oak address", () => {
  it("gives full access and the Oak daily limit without ORA metadata", () => {
    expect(accessFor({}, verified(oak))).toEqual({
      tier: "full",
      inCopyrightRegion: false,
      modelJobsPer24h: OAK_MODEL_JOBS_PER_24H,
    });
  });

  it.each([
    ["an unverified Oak address", [unverified(oak)]],
    [
      "an Oak address with no verification",
      [{ emailAddress: oak, verification: null }],
    ],
    ["a verified non-Oak address", [verified("teacher@example.com")]],
    ["a lookalike domain", [verified("teacher@notthenational.academy")]],
    [
      "an unverified Oak address beside a verified non-Oak address",
      [unverified(oak), verified("teacher@example.com")],
    ],
  ])("is not %s", (_, emailAddresses) => {
    expect(accessFor({}, ...emailAddresses)).toEqual({
      tier: "limited",
      inCopyrightRegion: false,
    });
  });
});

describe("an access-limit-me address", () => {
  it("makes a UK teacher limited, outside the copyright region, on the default daily limit", () => {
    expect(accessFor({ region: "GB" }, verified(accessLimitMe))).toEqual({
      tier: "limited",
      inCopyrightRegion: false,
    });
  });

  it("applies beside an unmarked Oak address", () => {
    expect(accessFor({}, verified(oak), verified(accessLimitMe)).tier).toBe("limited");
  });

  it("is ignored when unverified", () => {
    expect(accessFor({ region: "GB" }, unverified(accessLimitMe))).toEqual({
      tier: "full",
      inCopyrightRegion: true,
    });
  });

  it("gives way to a grant", () => {
    expect(
      accessFor({ region: "GB", ora: { access: "full" } }, verified(accessLimitMe)),
    ).toEqual({ tier: "full", inCopyrightRegion: true });
  });
});

describe("a rate-limit-me address", () => {
  it("lowers the daily limit for a UK teacher without changing their access", () => {
    expect(accessFor({ region: "GB" }, verified(rateLimitMe))).toEqual({
      tier: "full",
      inCopyrightRegion: true,
      modelJobsPer24h: RATE_LIMIT_ME_MODEL_JOBS_PER_24H,
    });
  });

  it("is ignored when unverified", () => {
    expect(accessFor({ region: "GB" }, unverified(rateLimitMe))).toEqual({
      tier: "full",
      inCopyrightRegion: true,
    });
  });

  it("gives way to a daily limit override", () => {
    expect(
      accessFor(
        { ora: { usageLimits: { modelJobsPer24h: 250 } } },
        verified(rateLimitMe),
      ).modelJobsPer24h,
    ).toBe(250);
  });

  it("combines with access-limit-me on another address", () => {
    expect(
      accessFor({ region: "GB" }, verified(accessLimitMe), verified(rateLimitMe)),
    ).toEqual({
      tier: "limited",
      inCopyrightRegion: false,
      modelJobsPer24h: RATE_LIMIT_ME_MODEL_JOBS_PER_24H,
    });
  });
});
