import { clerkClient } from "@clerk/nextjs/server";
import { raLogger } from "@oaknational/resource-adapter-logger";

import { teacherAccessFromMetadata, type TeacherAccess } from "./access";

export type TeacherAccessResolver = Readonly<{
  resolve: (teacherId: string) => Promise<TeacherAccess>;
  /**
   * Looks up again before a teacher is refused, so a new grant applies at once.
   * Falls back to the cached access if the lookup fails, so the refusal stands.
   */
  recheck: (teacherId: string) => Promise<TeacherAccess>;
}>;

type LookUp = (teacherId: string) => Promise<TeacherAccess>;

export const lookUpTeacherAccessInClerk: LookUp = async (teacherId) => {
  try {
    const user = await (await clerkClient()).users.getUser(teacherId);
    return teacherAccessFromMetadata(user.privateMetadata);
  } catch (error) {
    throw new Error("The teacher's access could not be looked up.", { cause: error });
  }
};

const TTL_MS = 10 * 60 * 1000;

const log = raLogger("auth");

type CacheEntry = Readonly<{ access: TeacherAccess; expiresAt: number }>;

export function createCachedTeacherAccessResolver(
  lookUp: LookUp,
  {
    now = Date.now,
    report = (error) => log.error(error, { report: true }),
    ttlMs = TTL_MS,
  }: { now?: () => number; report?: (error: unknown) => void; ttlMs?: number } = {},
): TeacherAccessResolver {
  // Every entry gets the same TTL, so insertion order is expiry order. That only
  // holds if an entry is deleted before it is set again.
  const entries = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<TeacherAccess>>();

  function evictExpired(at: number) {
    for (const [teacherId, entry] of entries) {
      if (entry.expiresAt > at) {
        return;
      }
      entries.delete(teacherId);
    }
  }

  function lookUpAndCache(teacherId: string): Promise<TeacherAccess> {
    evictExpired(now());
    const pending = inFlight.get(teacherId);
    if (pending !== undefined) return pending;
    const access = lookUp(teacherId)
      .then((value) => {
        entries.delete(teacherId);
        entries.set(teacherId, { access: value, expiresAt: now() + ttlMs });
        return value;
      })
      .finally(() => inFlight.delete(teacherId));
    inFlight.set(teacherId, access);
    return access;
  }

  return {
    resolve(teacherId) {
      const entry = entries.get(teacherId);
      return entry !== undefined && entry.expiresAt > now()
        ? Promise.resolve(entry.access)
        : lookUpAndCache(teacherId);
    },
    async recheck(teacherId) {
      const cached = entries.get(teacherId);
      try {
        return await lookUpAndCache(teacherId);
      } catch (error) {
        if (cached === undefined || cached.expiresAt <= now()) {
          throw error;
        }
        report(error);
        return cached.access;
      }
    },
  };
}

export const teacherAccessResolver = createCachedTeacherAccessResolver(
  lookUpTeacherAccessInClerk,
);
