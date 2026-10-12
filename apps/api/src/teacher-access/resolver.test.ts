import { describe, expect, it, vi } from "vitest";

import { createCachedTeacherAccessResolver } from "./resolver";

describe("the cached teacher access resolver", () => {
  it("serves a lookup until it expires", async () => {
    let now = 0;
    const lookUp = vi
      .fn()
      .mockResolvedValueOnce({ tier: "limited" })
      .mockResolvedValueOnce({ tier: "full" });
    const resolver = createCachedTeacherAccessResolver(lookUp, {
      now: () => now,
      ttlMs: 1000,
    });

    await expect(resolver.resolve("user_a")).resolves.toEqual({ tier: "limited" });
    now = 999;
    await expect(resolver.resolve("user_a")).resolves.toEqual({ tier: "limited" });
    now = 1000;
    await expect(resolver.resolve("user_a")).resolves.toEqual({ tier: "full" });
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it("looks up again on recheck and caches the result", async () => {
    const lookUp = vi
      .fn()
      .mockResolvedValueOnce({ tier: "limited" })
      .mockResolvedValueOnce({ tier: "full" });
    const resolver = createCachedTeacherAccessResolver(lookUp);

    await resolver.resolve("user_a");
    await expect(resolver.recheck("user_a")).resolves.toEqual({ tier: "full" });
    await expect(resolver.resolve("user_a")).resolves.toEqual({ tier: "full" });
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it("keeps the cached access and reports it when a recheck fails", async () => {
    let now = 0;
    const failure = new Error("Clerk is unavailable");
    const lookUp = vi
      .fn()
      .mockResolvedValueOnce({ tier: "limited" })
      .mockRejectedValue(failure);
    const report = vi.fn();
    const resolver = createCachedTeacherAccessResolver(lookUp, {
      report,
      now: () => now,
      ttlMs: 1000,
    });

    await resolver.resolve("user_a");
    now = 900;
    await expect(resolver.recheck("user_a")).resolves.toEqual({ tier: "limited" });
    expect(report).toHaveBeenCalledWith(failure);
    now = 999;
    await expect(resolver.resolve("user_a")).resolves.toEqual({ tier: "limited" });
    expect(lookUp).toHaveBeenCalledTimes(2);
    now = 1000;
    await expect(resolver.resolve("user_a")).rejects.toThrow("Clerk is unavailable");
  });

  it("serves valid cached access while a recheck is pending", async () => {
    const pending = Promise.withResolvers<{ tier: "full" }>();
    const lookUp = vi
      .fn()
      .mockResolvedValueOnce({ tier: "limited" })
      .mockReturnValue(pending.promise);
    const resolver = createCachedTeacherAccessResolver(lookUp);
    await resolver.resolve("user_a");
    const recheck = resolver.recheck("user_a");
    await expect(resolver.resolve("user_a")).resolves.toEqual({ tier: "limited" });
    pending.resolve({ tier: "full" });
    await expect(recheck).resolves.toEqual({ tier: "full" });
    await expect(resolver.resolve("user_a")).resolves.toEqual({ tier: "full" });
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it("shares a pending lookup when there is no cached access", async () => {
    const pending = Promise.withResolvers<{ tier: "limited" }>();
    const lookUp = vi.fn().mockReturnValue(pending.promise);
    const resolver = createCachedTeacherAccessResolver(lookUp);
    const first = resolver.resolve("user_a");
    const second = resolver.resolve("user_a");
    expect(lookUp).toHaveBeenCalledOnce();
    pending.resolve({ tier: "limited" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { tier: "limited" },
      { tier: "limited" },
    ]);
  });

  it("does not fall back to access that expired during a failed recheck", async () => {
    let now = 0;
    const pending = Promise.withResolvers<{ tier: "full" }>();
    const lookUp = vi
      .fn()
      .mockResolvedValueOnce({ tier: "limited" })
      .mockReturnValue(pending.promise);
    const resolver = createCachedTeacherAccessResolver(lookUp, {
      now: () => now,
      ttlMs: 1000,
    });
    await resolver.resolve("user_a");
    const recheck = resolver.recheck("user_a");
    now = 1000;
    pending.reject(new Error("Clerk is unavailable"));
    await expect(recheck).rejects.toThrow("Clerk is unavailable");
  });

  it("does not cache a failed lookup", async () => {
    const lookUp = vi
      .fn()
      .mockRejectedValueOnce(new Error("Clerk is unavailable"))
      .mockResolvedValueOnce({ tier: "full" });
    const resolver = createCachedTeacherAccessResolver(lookUp);

    await expect(resolver.resolve("user_a")).rejects.toThrow("Clerk is unavailable");
    await expect(resolver.resolve("user_a")).resolves.toEqual({ tier: "full" });
  });
});
