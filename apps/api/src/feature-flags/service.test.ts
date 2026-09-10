import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { postHogConstructorMock } = vi.hoisted(() => ({
  postHogConstructorMock: vi.fn(),
}));

vi.mock("./posthog-adapter", () => ({
  PostHogFeatureFlagAdapter: class {
    constructor() {
      postHogConstructorMock();
    }
  },
}));

const { FeatureFlagConfigurationError, getFeatureFlagService } =
  await import("./service");

beforeEach(() => {
  postHogConstructorMock.mockClear();
  vi.stubEnv("FEATURE_FLAG_TRANSPORT", undefined);
  vi.stubEnv("USE_POSTHOG", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getFeatureFlagService", () => {
  it("uses in-memory flags outside production", () => {
    getFeatureFlagService();

    expect(postHogConstructorMock).not.toHaveBeenCalled();
  });

  it("uses PostHog when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");

    getFeatureFlagService();

    expect(postHogConstructorMock).toHaveBeenCalledOnce();
  });

  it("uses PostHog when asked for explicitly", () => {
    vi.stubEnv("USE_POSTHOG", "true");

    getFeatureFlagService();

    expect(postHogConstructorMock).toHaveBeenCalledOnce();
  });

  it("serves in-memory flags to a built app that asks for them", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FEATURE_FLAG_TRANSPORT", "in-memory");

    getFeatureFlagService();

    expect(postHogConstructorMock).not.toHaveBeenCalled();
  });

  it("refuses in-memory flags on a production deployment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FEATURE_FLAG_TRANSPORT", "in-memory");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(() => getFeatureFlagService()).toThrow(FeatureFlagConfigurationError);
    expect(postHogConstructorMock).not.toHaveBeenCalled();
  });
});
