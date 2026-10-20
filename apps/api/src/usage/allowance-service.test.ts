import { describe, expect, it, vi } from "vitest";

import type { TeacherAccess } from "../teacher-access/access";
import { getTeacherAllowance } from "./allowance-service";
const teacher = { organisationId: null, teacherId: "user_test" };

function dependencies(
  access: TeacherAccess,
  adaptedCount: number,
  rechecked: TeacherAccess = access,
) {
  const adaptedResourcesSince = vi.fn().mockResolvedValue(
    Array.from({ length: adaptedCount }, (_, index) => ({
      capabilityId: "worksheetScaffolding",
      lessonSlug: `lesson-${index}`,
      programmeSlug: "programme",
    })),
  );
  return {
    access: {
      recheck: vi.fn().mockResolvedValue(rechecked),
      resolve: vi.fn().mockResolvedValue(access),
    },
    adaptedResourcesPerMonth: () => 3,
    now: () => new Date("2026-10-12T10:00:00.000Z"),
    adaptedResourcesSince,
  };
}

describe("a teacher's allowance", () => {
  it("has no monthly count for a teacher with full access", async () => {
    const stubs = dependencies({ tier: "full", inCopyrightRegion: true }, 5);

    await expect(getTeacherAllowance(teacher, stubs)).resolves.toEqual({
      tier: "full",
    });
    expect(stubs.adaptedResourcesSince).not.toHaveBeenCalled();
  });

  it("counts a limited teacher's uses since the start of the UK month", async () => {
    const stubs = dependencies({ tier: "limited", inCopyrightRegion: true }, 1);

    await expect(getTeacherAllowance(teacher, stubs)).resolves.toEqual({
      limit: 3,
      remaining: 2,
      resetsAt: "2026-11-01T00:00:00.000Z",
      tier: "limited",
    });
    expect(stubs.adaptedResourcesSince).toHaveBeenCalledWith(
      teacher.teacherId,
      new Date("2026-09-30T23:00:00.000Z"),
    );
  });

  it("never reports fewer than no uses remaining", async () => {
    const stubs = dependencies({ tier: "limited", inCopyrightRegion: true }, 4);

    await expect(getTeacherAllowance(teacher, stubs)).resolves.toMatchObject({
      remaining: 0,
    });
  });

  it("shows a grant made since the teacher's access was cached", async () => {
    const stubs = dependencies({ tier: "limited", inCopyrightRegion: true }, 3, {
      tier: "full",
      inCopyrightRegion: true,
    });

    await expect(getTeacherAllowance(teacher, stubs)).resolves.toEqual({
      tier: "full",
    });
  });
});
