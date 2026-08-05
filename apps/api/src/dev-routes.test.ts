import { afterEach, describe, expect, it, vi } from "vitest";

import { devRoutesEnabled } from "./dev-routes";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("devRoutesEnabled", () => {
  it("is closed when the variable is absent", () => {
    expect(devRoutesEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", " yes ", "on"])("opens for %j", (value) => {
    vi.stubEnv("ENABLE_DEV_ROUTES", value);

    expect(devRoutesEnabled()).toBe(true);
  });

  // A truthy-string check would open the routes for every one of these.
  it.each(["", "0", "false", "no", "off", "disabled"])(
    "stays closed for %j",
    (value) => {
      vi.stubEnv("ENABLE_DEV_ROUTES", value);

      expect(devRoutesEnabled()).toBe(false);
    },
  );
});
