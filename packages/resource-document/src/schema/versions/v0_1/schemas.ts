import * as z from "zod";

import type {
  AnswerAnnotation,
  Asset,
  DefinitionEntry,
  DocumentProvenance,
  GenericDocument,
  GenericMetadata,
  InlineContent,
  InlineRun,
  LayoutIntent,
  NamespacedExtensions,
  ResourceDocumentDiagnostic,
  ResourceDocument,
  ResourceNode,
  SourceMap,
  WorksheetDocument,
  WorksheetMetadata,
} from "./types.js";

export const RESOURCE_DOCUMENT_SCHEMA_VERSION_V0_1 = "0.1" as const;

const nonEmptyStringSchema = z.string().trim().min(1);
const identifierSchema = nonEmptyStringSchema.max(256);
const languageTagSchema = z
  .string()
  .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, "Expected a BCP 47 language tag");
const namespacedExtensionKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9.-]*:[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Extension keys must be namespaced, for example oak:source-kind",
  );

// Annotated so the inferred type names our own JsonValue: `z.json()` otherwise
// leaks zod's internal JSONType, which consumers cannot name portably.
export const extensionsSchema: z.ZodType<NamespacedExtensions> = z.record(
  namespacedExtensionKeySchema,
  z.json(),
);

export const textRunSchema = z.strictObject({
  type: z.literal("text"),
  text: z.string().min(1),
});

export const mathRunSchema = z.strictObject({
  type: z.literal("math"),
  value: nonEmptyStringSchema,
  display: z.boolean(),
});

export const inlineRunSchema = z.discriminatedUnion("type", [
  textRunSchema,
  mathRunSchema,
]);
export const inlineContentSchema = z.array(inlineRunSchema).min(1);

export const layoutBreakSchema = z.enum(["auto", "page"]);
export const preferredWidthSchema = z.enum(["content", "full", "half"]);

export const layoutIntentSchema = z.strictObject({
  keepTogether: z.boolean().optional(),
  keepWithNext: z.boolean().optional(),
  breakBefore: layoutBreakSchema.optional(),
  breakAfter: layoutBreakSchema.optional(),
  preferredWidth: preferredWidthSchema.optional(),
});

export const calloutRoleSchema = z.enum([
  "learning-objective",
  "instruction",
  "note",
  "warning",
]);
export const responseSpaceKindSchema = z.enum(["lines", "box", "grid"]);
export const answerPlacementSchema = z.enum(["append", "replace-response"]);
export const assetAlternativeOriginSchema = z.enum(["source", "inferred", "authored"]);
export const definitionSourceSchema = z.enum(["generated", "oak-lesson"]);
export const HEADING_LEVELS = { minimum: 1, maximum: 6 } as const;

export const definitionEntrySchema = z.strictObject({
  term: inlineContentSchema,
  definition: inlineContentSchema.optional(),
  example: inlineContentSchema.optional(),
  source: definitionSourceSchema.optional(),
});

const commonNodeShape = {
  id: identifierSchema,
  sourceRef: identifierSchema.optional(),
  layout: layoutIntentSchema.optional(),
  extensions: extensionsSchema.optional(),
};

export const resourceNodeSchema: z.ZodType<ResourceNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.strictObject({
      ...commonNodeShape,
      type: z.literal("section"),
      children: z.array(resourceNodeSchema),
    }),
    z.strictObject({
      ...commonNodeShape,
      type: z.literal("heading"),
      level: z.number().int().min(HEADING_LEVELS.minimum).max(HEADING_LEVELS.maximum),
      content: inlineContentSchema,
    }),
    z.strictObject({
      ...commonNodeShape,
      type: z.literal("paragraph"),
      content: inlineContentSchema,
    }),
    z.strictObject({
      ...commonNodeShape,
      type: z.literal("callout"),
      role: calloutRoleSchema,
      content: inlineContentSchema,
    }),
    z.strictObject({
      ...commonNodeShape,
      type: z.literal("question"),
      label: nonEmptyStringSchema.optional(),
      marks: z.number().int().nonnegative().optional(),
      children: z.array(resourceNodeSchema),
    }),
    z.strictObject({
      ...commonNodeShape,
      type: z.literal("definitionList"),
      lead: inlineContentSchema.optional(),
      entries: z.array(definitionEntrySchema).min(1),
    }),
    z.strictObject({
      ...commonNodeShape,
      type: z.literal("responseSpace"),
      kind: responseSpaceKindSchema,
      lines: z.number().int().positive().optional(),
    }),
    z.strictObject({
      ...commonNodeShape,
      type: z.literal("figure"),
      assetId: identifierSchema,
      caption: inlineContentSchema.optional(),
    }),
    z.strictObject({
      ...commonNodeShape,
      type: z.literal("unsupported"),
      description: nonEmptyStringSchema,
      accessibleText: nonEmptyStringSchema.optional(),
      original: z.strictObject({
        format: nonEmptyStringSchema,
        value: z.string(),
      }),
    }),
  ]),
);

export const answerAnnotationSchema = z.strictObject({
  id: identifierSchema,
  targetId: identifierSchema,
  placement: answerPlacementSchema,
  content: z.array(resourceNodeSchema).min(1),
  sourceRef: identifierSchema.optional(),
  extensions: extensionsSchema.optional(),
});

export const assetSchema = z.strictObject({
  id: identifierSchema,
  mediaType: nonEmptyStringSchema,
  contentRef: nonEmptyStringSchema,
  dimensions: z
    .strictObject({
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  alternative: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("decorative") }),
    z.strictObject({
      kind: z.literal("text"),
      text: nonEmptyStringSchema,
      origin: assetAlternativeOriginSchema,
    }),
    z.strictObject({ kind: z.literal("missing") }),
  ]),
  rights: nonEmptyStringSchema.optional(),
  credit: nonEmptyStringSchema.optional(),
  sourceRef: identifierSchema.optional(),
  extensions: extensionsSchema.optional(),
});

export const sourceRegionSchema = z.strictObject({
  source: nonEmptyStringSchema,
  page: z.number().int().positive(),
  boundingBox: z.strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  }),
  readingOrder: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
});
export const sourceMapSchema = z.record(identifierSchema, sourceRegionSchema);

export const resourceDocumentDiagnosticSchema = z.strictObject({
  category: z.enum([
    "uncertain-reading-order",
    "uncertain-semantics",
    "layout-fidelity-loss",
    "missing-asset",
    "unsupported-annotation",
    "unsupported-markup",
    "rights-or-provenance-unknown",
    "fixed-layout-fallback",
  ]),
  severity: z.enum(["info", "warning", "error"]),
  message: nonEmptyStringSchema,
  nodeId: identifierSchema.optional(),
  sourceRef: identifierSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  fallback: nonEmptyStringSchema.optional(),
  reviewRequired: z.boolean(),
});

const checksumSchema = z.strictObject({
  algorithm: z.literal("sha256"),
  value: z.string().regex(/^[a-fA-F0-9]{64}$/),
});

export const documentProvenanceSchema = z.strictObject({
  source: z.strictObject({
    system: nonEmptyStringSchema,
    id: nonEmptyStringSchema,
    uri: nonEmptyStringSchema.optional(),
    checksum: checksumSchema.optional(),
  }),
  producer: z.strictObject({
    name: nonEmptyStringSchema,
    version: nonEmptyStringSchema,
  }),
});

const curriculumContextSchema = z.strictObject({
  id: identifierSchema,
  label: nonEmptyStringSchema.optional(),
});

export const worksheetMetadataSchema = z.strictObject({
  title: nonEmptyStringSchema,
  subject: curriculumContextSchema.optional(),
  keyStage: curriculumContextSchema.optional(),
  yearGroup: curriculumContextSchema.optional(),
  targetReadingAge: z.number().int().positive().optional(),
});

export const genericMetadataSchema = z.strictObject({
  title: nonEmptyStringSchema.optional(),
});

const documentBaseShape = {
  schemaVersion: z.literal(RESOURCE_DOCUMENT_SCHEMA_VERSION_V0_1),
  id: identifierSchema,
  language: languageTagSchema,
  content: z.array(resourceNodeSchema),
  answers: z.array(answerAnnotationSchema),
  assets: z.array(assetSchema),
  provenance: documentProvenanceSchema,
  sourceMap: sourceMapSchema.optional(),
  diagnostics: z.array(resourceDocumentDiagnosticSchema),
  extensions: extensionsSchema.optional(),
};

export const worksheetDocumentV0_1Schema = z.strictObject({
  ...documentBaseShape,
  profile: z.literal("worksheet.v0"),
  metadata: worksheetMetadataSchema,
});

export const genericDocumentV0_1Schema = z.strictObject({
  ...documentBaseShape,
  profile: z.literal("generic.v0"),
  metadata: genericMetadataSchema,
});

export const resourceDocumentV0_1Schema = z.discriminatedUnion("profile", [
  worksheetDocumentV0_1Schema,
  genericDocumentV0_1Schema,
]);

type Exact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/**
 * Compile-time proof that every hand-declared type in `types.ts` still matches
 * the schema that validates it. Changing one without the other fails here.
 */
export type SchemaTypeAssertions = [
  Expect<Exact<NamespacedExtensions, z.output<typeof extensionsSchema>>>,
  Expect<Exact<InlineRun, z.output<typeof inlineRunSchema>>>,
  Expect<Exact<InlineContent, z.output<typeof inlineContentSchema>>>,
  Expect<Exact<LayoutIntent, z.output<typeof layoutIntentSchema>>>,
  Expect<Exact<DefinitionEntry, z.output<typeof definitionEntrySchema>>>,
  Expect<Exact<AnswerAnnotation, z.output<typeof answerAnnotationSchema>>>,
  Expect<Exact<Asset, z.output<typeof assetSchema>>>,
  Expect<Exact<SourceMap, z.output<typeof sourceMapSchema>>>,
  Expect<
    Exact<ResourceDocumentDiagnostic, z.output<typeof resourceDocumentDiagnosticSchema>>
  >,
  Expect<Exact<DocumentProvenance, z.output<typeof documentProvenanceSchema>>>,
  Expect<Exact<WorksheetMetadata, z.output<typeof worksheetMetadataSchema>>>,
  Expect<Exact<GenericMetadata, z.output<typeof genericMetadataSchema>>>,
  Expect<Exact<WorksheetDocument, z.output<typeof worksheetDocumentV0_1Schema>>>,
  Expect<Exact<GenericDocument, z.output<typeof genericDocumentV0_1Schema>>>,
  Expect<Exact<ResourceDocument, z.output<typeof resourceDocumentV0_1Schema>>>,
];
