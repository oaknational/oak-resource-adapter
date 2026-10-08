import { describe, expect, it, vi } from "vitest";

import { createModelJobLimiter, modelJobsPer24hLimit } from "./limiter";

describe("the model jobs per 24 hours limit", () => {
  it("falls back to the production limit when unset", () => {
    expect(modelJobsPer24hLimit(undefined)).toBe(100);
    expect(modelJobsPer24hLimit(" ")).toBe(100);
  });

  it("reads a configured limit", () => {
    expect(modelJobsPer24hLimit("100000")).toBe(100000);
  });

  it.each(["0", "-5", "1.5", "1e3", "unlimited"])("refuses %s", (configured) => {
    expect(() => modelJobsPer24hLimit(configured)).toThrow(
      "USAGE_LIMIT_MODEL_JOBS_PER_24H must be a positive integer.",
    );
  });
});

describe("the model job limiter", () => {
  it("checks the teacher's usage against the configured limit", async () => {
    const retryAt = vi.fn().mockResolvedValue(null);
    const limiter = createModelJobLimiter({ limit: () => 7, retryAt });

    await expect(limiter.check("user_test_teacher")).resolves.toEqual({
      allowed: true,
    });
    expect(retryAt).toHaveBeenCalledWith("user_test_teacher", 7);
  });

  it("reports when a teacher at the limit can start work again", async () => {
    const limiter = createModelJobLimiter({
      limit: () => 7,
      retryAt: vi.fn().mockResolvedValue(new Date("2026-02-04T09:00:00.000Z")),
    });

    await expect(limiter.check("user_test_teacher")).resolves.toEqual({
      allowed: false,
      usageLimit: { kind: "model_jobs_24h", retryAt: "2026-02-04T09:00:00.000Z" },
    });
  });
});
