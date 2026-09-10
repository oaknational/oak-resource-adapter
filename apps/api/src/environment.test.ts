import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isDeployment, isProductionMode, isProductionDeployment } from "./environment";

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("environment predicates", () => {
  it.each([
    { vercel: undefined, deployment: false, production: false },
    { vercel: "", deployment: false, production: false },
    { vercel: "development", deployment: false, production: false },
    { vercel: "preview", deployment: true, production: false },
    { vercel: "production", deployment: true, production: true },
    { vercel: "unknown", deployment: false, production: false },
  ])(
    "classifies VERCEL_ENV=$vercel independently of Node mode",
    ({ vercel, deployment, production }) => {
      vi.stubEnv("VERCEL_ENV", vercel);

      for (const mode of [
        undefined,
        "",
        "test",
        "development",
        "production",
      ] as const) {
        vi.stubEnv("NODE_ENV", mode);

        expect(isDeployment()).toBe(deployment);
        expect(isProductionDeployment()).toBe(production);
        expect(isProductionMode()).toBe(mode === "production");
      }
    },
  );

  it("classifies hosted staging as a non-production deployment", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_TARGET_ENV", "staging");
    vi.stubEnv("NODE_ENV", "production");

    expect(isDeployment()).toBe(true);
    expect(isProductionDeployment()).toBe(false);
    expect(isProductionMode()).toBe(true);
  });

  it("reads environment changes after import", () => {
    expect(isDeployment()).toBe(false);
    expect(isProductionDeployment()).toBe(false);
    expect(isProductionMode()).toBe(false);

    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");

    expect(isDeployment()).toBe(true);
    expect(isProductionDeployment()).toBe(true);
    expect(isProductionMode()).toBe(true);

    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NODE_ENV", "development");

    expect(isDeployment()).toBe(false);
    expect(isProductionDeployment()).toBe(false);
    expect(isProductionMode()).toBe(false);
  });
});
