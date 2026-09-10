import { test as base, expect } from "@playwright/test";

export const test = base.extend<{
  trackAdaptation: (adaptationId: string) => void;
}>({
  trackAdaptation: async ({ baseURL }, use) => {
    const databaseUrl = process.env.DATABASE_URL;
    const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
    if (
      process.env.E2E_BASE_URL ||
      !baseURL ||
      !loopbackHosts.includes(new URL(baseURL).hostname) ||
      !databaseUrl ||
      !loopbackHosts.includes(new URL(databaseUrl).hostname)
    ) {
      throw new Error(
        "Adaptation teardown requires a local test database and servers.",
      );
    }

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
