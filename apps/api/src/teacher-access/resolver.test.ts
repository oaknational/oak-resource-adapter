import { describe, expect, it, vi } from "vitest";

import { createCachedTeacherAccessResolver } from "./resolver";
import type { TeacherAccess } from "./access";

const limited: TeacherAccess = { tier: "limited", inCopyrightRegion: false };
const full: TeacherAccess = { tier: "full", inCopyrightRegion: true };

describe("the cached teacher access resolver", () => {
  it("serves a lookup until it expires", async () => {
    let now = 0;
    const lookUp = vi
      .fn<() => Promise<TeacherAccess>>()
      .mockResolvedValueOnce(limited)
      .mockResolvedValueOnce(full);
    const resolver = createCachedTeacherAccessResolver(lookUp, {
      now: () => now,
      ttlMs: 1000,
    });

    await expect(resolver.resolve("user_a")).resolves.toEqual(limited);
    now = 999;
    await expect(resolver.resolve("user_a")).resolves.toEqual(limited);
    now = 1000;
    await expect(resolver.resolve("user_a")).resolves.toEqual(full);
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it("looks up again on recheck and caches the result", async () => {
    const lookUp = vi
      .fn<() => Promise<TeacherAccess>>()
      .mockResolvedValueOnce(limited)
      .mockResolvedValueOnce(full);
    const resolver = createCachedTeacherAccessResolver(lookUp);

    await resolver.resolve("user_a");
    await expect(resolver.recheck("user_a")).resolves.toEqual(full);
    await expect(resolver.resolve("user_a")).resolves.toEqual(full);
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it("keeps the cached access and reports it when a recheck fails", async () => {
    let now = 0;
    const failure = new Error("Clerk is unavailable");
    const lookUp = vi
      .fn<() => Promise<TeacherAccess>>()
      .mockResolvedValueOnce(limited)
      .mockRejectedValue(failure);
    const report = vi.fn();
    const resolver = createCachedTeacherAccessResolver(lookUp, {
      report,
      now: () => now,
      ttlMs: 1000,
    });

    await resolver.resolve("user_a");
    now = 900;
    await expect(resolver.recheck("user_a")).resolves.toEqual(limited);
    expect(report).toHaveBeenCalledWith(failure);
    now = 999;
    await expect(resolver.resolve("user_a")).resolves.toEqual(limited);
    expect(lookUp).toHaveBeenCalledTimes(2);
    now = 1000;
    await expect(resolver.resolve("user_a")).rejects.toThrow("Clerk is unavailable");
  });

  it("serves valid cached access while a recheck is pending", async () => {
    const pending = Promise.withResolvers<TeacherAccess>();
    const lookUp = vi
      .fn<() => Promise<TeacherAccess>>()
      .mockResolvedValueOnce(limited)
      .mockReturnValue(pending.promise);
    const resolver = createCachedTeacherAccessResolver(lookUp);
    await resolver.resolve("user_a");
    const recheck = resolver.recheck("user_a");
    await expect(resolver.resolve("user_a")).resolves.toEqual(limited);
    pending.resolve(full);
    await expect(recheck).resolves.toEqual(full);
    await expect(resolver.resolve("user_a")).resolves.toEqual(full);
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it("shares a pending lookup when there is no cached access", async () => {
    const pending = Promise.withResolvers<TeacherAccess>();
    const lookUp = vi
      .fn<() => Promise<TeacherAccess>>()
      .mockReturnValue(pending.promise);
    const resolver = createCachedTeacherAccessResolver(lookUp);
    const first = resolver.resolve("user_a");
    const second = resolver.resolve("user_a");
    expect(lookUp).toHaveBeenCalledOnce();
    pending.resolve(limited);
    await expect(Promise.all([first, second])).resolves.toEqual([limited, limited]);
  });

  it("does not fall back to access that expired during a failed recheck", async () => {
    let now = 0;
    const pending = Promise.withResolvers<TeacherAccess>();
    const lookUp = vi
      .fn<() => Promise<TeacherAccess>>()
      .mockResolvedValueOnce(limited)
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
      .fn<() => Promise<TeacherAccess>>()
      .mockRejectedValueOnce(new Error("Clerk is unavailable"))
      .mockResolvedValueOnce(full);
    const resolver = createCachedTeacherAccessResolver(lookUp);

    await expect(resolver.resolve("user_a")).rejects.toThrow("Clerk is unavailable");
    await expect(resolver.resolve("user_a")).resolves.toEqual(full);
  });
});
