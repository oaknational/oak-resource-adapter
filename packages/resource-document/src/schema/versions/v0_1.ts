import * as z from "zod";

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

export const extensionsSchema = z.record(namespacedExtensionKeySchema, z.json());
export type NamespacedExtensions = z.output<typeof extensionsSchema>;

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

export type InlineRun = z.output<typeof inlineRunSchema>;
export type InlineContent = z.output<typeof inlineContentSchema>;

export const layoutBreakSchema = z.enum(["auto", "page"]);
export const preferredWidthSchema = z.enum(["content", "full", "half"]);

export const layoutIntentSchema = z.strictObject({
  keepTogether: z.boolean().optional(),
  keepWithNext: z.boolean().optional(),
  breakBefore: layoutBreakSchema.optional(),
  breakAfter: layoutBreakSchema.optional(),
  preferredWidth: preferredWidthSchema.optional(),
});
export type LayoutIntent = z.output<typeof layoutIntentSchema>;

interface ResourceNodeBase {
  id: string;
  sourceRef?: string | undefined;
  layout?: LayoutIntent | undefined;
  extensions?: NamespacedExtensions | undefined;
}

export interface SectionNode extends ResourceNodeBase {
  type: "section";
  children: ResourceNode[];
}

export interface HeadingNode extends ResourceNodeBase {
  type: "heading";
  level: number;
  content: InlineContent;
}

export interface ParagraphNode extends ResourceNodeBase {
  type: "paragraph";
  content: InlineContent;
}

export const calloutRoleSchema = z.enum([
  "learning-objective",
  "instruction",
  "note",
  "warning",
]);
export const responseSpaceKindSchema = z.enum(["lines", "box", "grid"]);
export const answerPlacementSchema = z.enum(["append", "replace-response"]);
export const assetAlternativeOriginSchema = z.enum(["source", "inferred", "authored"]);

export const HEADING_LEVELS = { minimum: 1, maximum: 6 } as const;

export interface CalloutNode extends ResourceNodeBase {
  type: "callout";
  role: z.output<typeof calloutRoleSchema>;
  content: InlineContent;
}

export interface QuestionNode extends ResourceNodeBase {
  type: "question";
  label?: string | undefined;
  marks?: number | undefined;
  children: ResourceNode[];
}

export interface ResponseSpaceNode extends ResourceNodeBase {
  type: "responseSpace";
  kind: z.output<typeof responseSpaceKindSchema>;
  lines?: number | undefined;
}

export interface FigureNode extends ResourceNodeBase {
  type: "figure";
  assetId: string;
  caption?: InlineContent | undefined;
}

export interface UnsupportedNode extends ResourceNodeBase {
  type: "unsupported";
  description: string;
  accessibleText?: string | undefined;
  original: {
    format: string;
    value: string;
  };
}

export type ResourceNode =
  | SectionNode
  | HeadingNode
  | ParagraphNode
  | CalloutNode
  | QuestionNode
  | ResponseSpaceNode
  | FigureNode
  | UnsupportedNode;

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
export type AnswerAnnotation = z.output<typeof answerAnnotationSchema>;

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
export type Asset = z.output<typeof assetSchema>;

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
export type SourceMap = z.output<typeof sourceMapSchema>;

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
export type ResourceDocumentDiagnostic = z.output<
  typeof resourceDocumentDiagnosticSchema
>;

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
export type DocumentProvenance = z.output<typeof documentProvenanceSchema>;

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

export type WorksheetDocumentV0_1 = z.output<typeof worksheetDocumentV0_1Schema>;
export type GenericDocumentV0_1 = z.output<typeof genericDocumentV0_1Schema>;
export type ResourceDocumentV0_1 = z.output<typeof resourceDocumentV0_1Schema>;
