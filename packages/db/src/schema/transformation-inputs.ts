import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { resourceAdapterSchema } from "./pg-schema.js";
import { resourceDocuments } from "./resource-documents.js";
import { transformations } from "./transformations.js";

/** Documents a transformation reads, shared by all of its attempts. */
export const transformationInputs = resourceAdapterSchema.table(
  "transformation_inputs",
  {
    /** The resource being adapted, or wider lesson material for context. */
    inputRole: text("input_role").notNull(),
    /** Stable ordering, so prompt assembly is reproducible. */
    position: integer("position").notNull(),
    resourceDocumentId: uuid("resource_document_id").notNull(),
    transformationId: uuid("transformation_id").notNull(),
  },
  (table) => [
    check("transformation_inputs_position_check", sql`${table.position} >= 0`),
    primaryKey({
      columns: [table.transformationId, table.resourceDocumentId],
      name: "transformation_inputs_pkey",
    }),
    unique("transformation_inputs_position_key").on(
      table.transformationId,
      table.position,
    ),
    foreignKey({
      columns: [table.transformationId],
      foreignColumns: [transformations.id],
      name: "transformation_inputs_transformation_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.resourceDocumentId],
      foreignColumns: [resourceDocuments.id],
      name: "transformation_inputs_document_fk",
    }).onDelete("restrict"),
    index("transformation_inputs_document_idx").on(table.resourceDocumentId),
  ],
);

export type TransformationInput = typeof transformationInputs.$inferSelect;
export type NewTransformationInput = typeof transformationInputs.$inferInsert;
