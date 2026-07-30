import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { adaptations } from "./adaptations.js";

/**
 * One change a teacher asked for: a click, or the single request of a one-shot
 * capability. `kind` keys into the TypeScript transformation registry.
 */
export const transformations = pgTable(
  "transformations",
  {
    /**
     * The only foreign key here declared by callback rather than named: it closes
     * a cycle with `adaptations.head_resource_document_id`, and the annotation is
     * what stops the four tables in that cycle inferring as `any`.
     */
    adaptationId: uuid("adaptation_id")
      .notNull()
      .references((): AnyPgColumn => adaptations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Client-supplied. Callers must use a fresh UUID per distinct request. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    kind: text("kind").notNull(),
    /** Arguments for a parameterised kind, validated by the registry. */
    params: jsonb("params").notNull().default({}),
    /** The block this change targets. Null when it applies to the whole document. */
    targetBlockId: text("target_block_id"),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("transformations_adaptation_id_created_at_idx").on(
      table.adaptationId,
      table.createdAt,
    ),
  ],
);

export type Transformation = typeof transformations.$inferSelect;
export type NewTransformation = typeof transformations.$inferInsert;
