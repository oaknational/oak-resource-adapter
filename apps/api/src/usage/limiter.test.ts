import { describe, expect, it, vi } from "vitest";

import type { TeacherAccess } from "../teacher-access/access";
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

function accessResolving(...accesses: TeacherAccess[]) {
  const access = vi.fn<(teacherId: string) => Promise<TeacherAccess>>();
  for (const value of accesses) {
    access.mockResolvedValueOnce(value);
  }
  return { recheck: access, resolve: access };
}

describe("the model job limiter", () => {
  it("checks the teacher's usage against the configured limit", async () => {
    const retryAt = vi.fn().mockResolvedValue(null);
    const limiter = createModelJobLimiter({
      access: accessResolving({ tier: "full" }),
      limit: () => 7,
      retryAt,
    });

    await expect(limiter.check("user_test_teacher")).resolves.toEqual({
      allowed: true,
    });
    expect(retryAt).toHaveBeenCalledWith("user_test_teacher", 7);
  });

  it("reports when a teacher at the limit can start work again", async () => {
    const limiter = createModelJobLimiter({
      access: accessResolving({ tier: "full" }, { tier: "full" }),
      limit: () => 7,
      retryAt: vi.fn().mockResolvedValue(new Date("2026-02-04T09:00:00.000Z")),
    });

    await expect(limiter.check("user_test_teacher")).resolves.toEqual({
      allowed: false,
      usageLimit: { kind: "model_jobs_24h", retryAt: "2026-02-04T09:00:00.000Z" },
    });
  });

  it("uses the teacher's override in place of the configured limit", async () => {
    const retryAt = vi.fn().mockResolvedValue(null);
    const limiter = createModelJobLimiter({
      access: accessResolving({ tier: "limited", modelJobsPer24h: 250 }),
      limit: () => 7,
      retryAt,
    });

    await limiter.check("user_test_teacher");
    expect(retryAt).toHaveBeenCalledWith("user_test_teacher", 250);
  });

  it("looks the teacher up again before refusing", async () => {
    const retryAt = vi
      .fn()
      .mockResolvedValueOnce(new Date("2026-02-04T09:00:00.000Z"))
      .mockResolvedValueOnce(null);
    const limiter = createModelJobLimiter({
      access: accessResolving({ tier: "full" }, { tier: "full", modelJobsPer24h: 250 }),
      limit: () => 7,
      retryAt,
    });

    await expect(limiter.check("user_test_teacher")).resolves.toEqual({
      allowed: true,
    });
    expect(retryAt).toHaveBeenLastCalledWith("user_test_teacher", 250);
  });
});
