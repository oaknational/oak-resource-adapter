import { sql } from "drizzle-orm";
import { foreignKey, index, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { resourceAdapterSchema } from "./pg-schema.js";
import { resourceDocuments } from "./resource-documents.js";

/**
 * A teacher's ongoing work on one resource: the container for every
 * transformation they request, and the pointer to what they currently see.
 */
export const adaptations = resourceAdapterSchema.table(
  "adaptations",
  {
    /** Stable ID of the teacher-facing workflow this adaptation belongs to. */
    capabilityId: text("capability_id").notNull(),
    /** Clerk stays the source of truth for identity. No FK, no local user table. */
    clerkUserId: text("clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The document the teacher currently sees, which undo and redo move. */
    headResourceDocumentId: uuid("head_resource_document_id"),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Optional launch context. Null when work was not initiated from one lesson. */
    lessonSlug: text("lesson_slug"),
    /** Optional launch context. Null for work outside an Oak programme. */
    programmeSlug: text("programme_slug"),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.headResourceDocumentId],
      foreignColumns: [resourceDocuments.id],
      name: "adaptations_head_document_fk",
    }).onDelete("restrict"),
    index("adaptations_clerk_user_id_created_at_idx").on(
      table.clerkUserId,
      table.createdAt.desc(),
    ),
  ],
);

export type Adaptation = typeof adaptations.$inferSelect;
export type NewAdaptation = typeof adaptations.$inferInsert;
