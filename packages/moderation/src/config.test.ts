import { describe, expect, it } from "vitest";

import { moderationConfigFromEnv } from "./config.js";

describe("moderationConfigFromEnv", () => {
  it("reads and trims the URL and bypass secret", () => {
    expect(
      moderationConfigFromEnv({
        MODERATION_API_URL: " https://moderation.test ",
        MODERATION_API_BYPASS_SECRET: " bypass ",
      }),
    ).toEqual({ apiUrl: "https://moderation.test", bypassSecret: "bypass" });
  });

  it("leaves the bypass secret out when it is unset or blank", () => {
    expect(
      moderationConfigFromEnv({ MODERATION_API_URL: "https://moderation.test" }),
    ).toEqual({
      apiUrl: "https://moderation.test",
    });
    expect(
      moderationConfigFromEnv({
        MODERATION_API_URL: "https://moderation.test",
        MODERATION_API_BYPASS_SECRET: "  ",
      }),
    ).toEqual({ apiUrl: "https://moderation.test" });
  });

  it.each([{}, { MODERATION_API_URL: "" }, { MODERATION_API_URL: "   " }])(
    "throws when the URL is missing or blank: %o",
    (env) => {
      expect(() => moderationConfigFromEnv(env)).toThrow(
        "The moderation service is not configured: MODERATION_API_URL is missing or blank.",
      );
    },
  );
});
