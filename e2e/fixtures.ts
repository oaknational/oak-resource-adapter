import { test as base, expect } from "@playwright/test";

function localDatabaseUrl(baseURL: string | undefined): string {
  const databaseUrl = process.env.DATABASE_URL;
  const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
  if (
    process.env.E2E_BASE_URL ||
    !baseURL ||
    !loopbackHosts.includes(new URL(baseURL).hostname) ||
    !databaseUrl ||
    !loopbackHosts.includes(new URL(databaseUrl).hostname)
  ) {
    throw new Error("Adaptation fixtures require a local test database and servers.");
  }
  return databaseUrl;
}

export const test = base.extend<{
  clearLessonAdaptations: (lessonSlug: string) => Promise<void>;
  trackAdaptation: (adaptationId: string) => void;
}>({
  clearLessonAdaptations: async ({ baseURL, page }, use) => {
    const databaseUrl = localDatabaseUrl(baseURL);
    await use(async (lessonSlug) => {
      const teacherId = await page.evaluate(() => {
        const clerkWindow = window as Window & {
          Clerk?: { user?: { id: string } | null };
        };
        return clerkWindow.Clerk?.user?.id;
      });
      if (!teacherId) throw new Error("Sign in before clearing lesson adaptations.");

      const { adaptations, createDatabaseClient } =
        await import("@oaknational/resource-adapter-db");
      const { and, eq, isNull } = await import("drizzle-orm");
      const database = createDatabaseClient(databaseUrl);
      try {
        await database
          .update(adaptations)
          .set({ abandonedAt: new Date() })
          .where(
            and(
              eq(adaptations.clerkUserId, teacherId),
              eq(adaptations.capabilityId, "worksheetScaffolding"),
              eq(adaptations.lessonSlug, lessonSlug),
              isNull(adaptations.abandonedAt),
            ),
          );
      } finally {
        await database.$client.end();
      }
    });
  },
  trackAdaptation: async ({ baseURL }, use) => {
    const databaseUrl = localDatabaseUrl(baseURL);

    const ids = new Set<string>();
    try {
      await use((id) => ids.add(id));
    } finally {
      if (ids.size > 0) {
        // Deployment-test discovery loads this module without built DB packages.
        const { adaptations, createDatabaseClient } =
          await import("@oaknational/resource-adapter-db");
        const { inArray } = await import("drizzle-orm");

        const database = createDatabaseClient(databaseUrl);
        try {
          // Abandon rather than delete: in-flight jobs still reference this state.
          const abandoned = await database
            .update(adaptations)
            .set({ abandonedAt: new Date() })
            .where(inArray(adaptations.id, [...ids]))
            .returning({ id: adaptations.id });
          expect(abandoned.map(({ id }) => id).sort()).toEqual([...ids].sort());
        } finally {
          await database.$client.end();
        }
      }
    }
  },
});
