import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureFlagEvaluations } from "posthog-node";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

const {
  evaluateFlagsMock,
  isEnabledMock,
  loggerErrorMock,
  raLoggerMock,
  postHogConstructorMock,
} = vi.hoisted(() => ({
  evaluateFlagsMock:
    vi.fn<
      (
        distinctId: string,
        options?: { groups?: Record<string, string | number> },
      ) => Promise<FeatureFlagEvaluations>
    >(),
  isEnabledMock: vi.fn<FeatureFlagEvaluations["isEnabled"]>(),
  loggerErrorMock: vi.fn(),
  raLoggerMock: vi.fn(),
  postHogConstructorMock: vi.fn<(apiKey: string, options: { host: string }) => void>(),
}));

vi.mock("@oaknational/resource-adapter-logger", () => ({
  raLogger: (...args: unknown[]) => {
    raLoggerMock(...args);
    return { error: loggerErrorMock };
  },
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: [string, { host: string }]) {
      postHogConstructorMock(...args);
    }

    evaluateFlags = evaluateFlagsMock;
  },
}));

const API_KEY = "phc_test_key";
const HOST = "https://posthog.example";
const POSTHOG_EU_HOST = "https://eu.i.posthog.com";

const teacherInOrganisation: ResourceAdapterAuthenticatedTeacher = {
  teacherId: "teacher_123",
  organisationId: "org_456",
};

const teacherWithoutOrganisation: ResourceAdapterAuthenticatedTeacher = {
  teacherId: "teacher_789",
  organisationId: null,
};

function providerAnswers(value: boolean) {
  isEnabledMock.mockReturnValue(value);
  evaluateFlagsMock.mockResolvedValue({
    isEnabled: isEnabledMock,
  } as unknown as FeatureFlagEvaluations);
}

async function loadAdapterModule() {
  vi.resetModules();
  return import("./posthogAdapter");
}

async function loadFreshAdapter() {
  const { PostHogFeatureFlagAdapter } = await loadAdapterModule();
  return new PostHogFeatureFlagAdapter();
}

describe("PostHogFeatureFlagAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evaluateFlagsMock.mockReset();
    isEnabledMock.mockReset();
    vi.stubEnv("POSTHOG_API_KEY", API_KEY);
    vi.stubEnv("POSTHOG_HOST", HOST);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("client construction", () => {
    it("builds the provider client from the configured key and host", async () => {
      providerAnswers(true);

      await loadFreshAdapter();

      expect(postHogConstructorMock).toHaveBeenCalledWith(API_KEY, { host: HOST });
    });

    it("defaults to the PostHog EU host when POSTHOG_HOST is unset", async () => {
      vi.stubEnv("POSTHOG_HOST", undefined);
      providerAnswers(true);

      await loadFreshAdapter();

      expect(postHogConstructorMock).toHaveBeenCalledWith(API_KEY, {
        host: POSTHOG_EU_HOST,
      });
    });

    it("shares a single client across adapter instances", async () => {
      providerAnswers(true);
      const { PostHogFeatureFlagAdapter } = await loadAdapterModule();

      new PostHogFeatureFlagAdapter();
      new PostHogFeatureFlagAdapter();

      expect(postHogConstructorMock).toHaveBeenCalledTimes(1);
    });

    it("scopes its logger to feature-flags", async () => {
      providerAnswers(true);

      await loadFreshAdapter();

      expect(raLoggerMock).toHaveBeenCalledWith("feature-flags");
    });
  });

  describe("evaluation", () => {
    it("returns true when the provider marks a flag as enabled", async () => {
      providerAnswers(true);
      const adapter = await loadFreshAdapter();

      await expect(
        adapter.isEnabled("capabilities-smoke-test", teacherInOrganisation),
      ).resolves.toBe(true);
    });

    it("returns false when the provider marks a flag as disabled", async () => {
      providerAnswers(false);
      const adapter = await loadFreshAdapter();

      await expect(
        adapter.isEnabled("capabilities-smoke-test", teacherInOrganisation),
      ).resolves.toBe(false);
    });
  });

  describe("provider failure", () => {
    it("resolves false and reports the error instead of rejecting", async () => {
      const providerError = new Error("posthog unavailable");
      evaluateFlagsMock.mockRejectedValue(providerError);
      const adapter = await loadFreshAdapter();

      await expect(
        adapter.isEnabled("capabilities-smoke-test", teacherInOrganisation),
      ).resolves.toBe(false);
      expect(loggerErrorMock).toHaveBeenCalledWith(providerError, { report: true });
    });

    it("does not reject when the provider throws synchronously", async () => {
      const providerError = new Error("client misconfigured");
      evaluateFlagsMock.mockImplementation(() => {
        throw providerError;
      });
      const adapter = await loadFreshAdapter();

      await expect(
        adapter.isEnabled("capabilities-smoke-test", teacherInOrganisation),
      ).resolves.toBe(false);
      expect(loggerErrorMock).toHaveBeenCalledWith(providerError, { report: true });
    });
  });
});
