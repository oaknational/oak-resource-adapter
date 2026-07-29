import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** A teacher's logical request for a resource. */
export const generations = pgTable(
  "generations",
  {
    /** Stable ID of the teacher-facing workflow that created this request. */
    capabilityId: text("capability_id").notNull(),
    /** Clerk stays the source of truth for identity. No FK, no local user table. */
    clerkUserId: text("clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Client-supplied. Callers must use a fresh UUID per distinct request. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** Optional launch context. Null when work was not initiated from one lesson. */
    lessonSlug: text("lesson_slug"),
    /** Optional launch context. Null for work outside an Oak programme. */
    programmeSlug: text("programme_slug"),
    /** The teacher's chosen options and any unstructured launch context. */
    request: jsonb("request").notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("generations_clerk_user_id_created_at_idx").on(
      table.clerkUserId,
      table.createdAt.desc(),
    ),
  ],
);

export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;
