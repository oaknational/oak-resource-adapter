import * as z from "zod/mini";

/** The API contract version served by the immutable `/trpc/v1` endpoint. */
export const resourceAdapterApiContractVersionV1 = 1;
export const resourceAdapterApiContractVersionHeader =
  "x-resource-adapter-contract-version";

/**
 * The canonical wire format for the API contract version header.
 *
 * Keeping this validation in the browser-safe contracts entrypoint means every
 * caller can construct the same header, while the API can reject ambiguous
 * values such as `1beta` rather than accepting them through `parseInt`.
 */
export const resourceAdapterApiContractVersionHeaderSchema = z
  .string()
  .check(z.regex(/^[1-9]\d*$/));

/** Parses a canonical API contract version header, or returns null if invalid. */
export function parseResourceAdapterApiContractVersion(
  value: string | null,
): number | null {
  if (value === null) {
    return null;
  }

  const parsedValue = resourceAdapterApiContractVersionHeaderSchema.safeParse(value);

  if (!parsedValue.success) {
    return null;
  }

  const version = Number(parsedValue.data);

  return Number.isSafeInteger(version) ? version : null;
}

export const lessonResourceTypeSchema = z.enum(["worksheet", "starter-quiz"]);

const nonEmptyStringSchema = z.string().check(z.minLength(1));

export const lessonContextSchema = z.object({
  lessonSlug: nonEmptyStringSchema,
  programmeSlug: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  subjectSlug: nonEmptyStringSchema,
  keyStageSlug: nonEmptyStringSchema,
  availableResources: z.readonly(z.array(lessonResourceTypeSchema)),
});

export type LessonResourceType = z.infer<typeof lessonResourceTypeSchema>;
export type LessonContext = z.infer<typeof lessonContextSchema>;

/**
 * Capability identifiers are service-owned and intentionally open-ended.
 * Individual UI package versions filter this list to the capabilities they
 * know how to render, so a newer service cannot break an older host package.
 */
export const resourceAdapterCapabilityIdSchema = nonEmptyStringSchema;

export const resourceAdapterCapabilitySchema = z.object({
  id: resourceAdapterCapabilityIdSchema,
  label: nonEmptyStringSchema,
  resourceType: lessonResourceTypeSchema,
});

export const resourceAdapterCapabilitiesResponseSchema = z.object({
  capabilities: z.readonly(z.array(resourceAdapterCapabilitySchema)),
});

export type ResourceAdapterCapabilityId = z.infer<
  typeof resourceAdapterCapabilityIdSchema
>;
export type ResourceAdapterCapability = z.infer<typeof resourceAdapterCapabilitySchema>;
export type ResourceAdapterCapabilitiesResponse = z.infer<
  typeof resourceAdapterCapabilitiesResponseSchema
>;

/**
 * A render failure reported by the UI package's error boundary.
 *
 * There is no free-form metadata field, so tokens, lesson contents and prompts
 * have nowhere to travel. The UI truncates to these same limits before sending.
 */
export const clientErrorReportLimits = {
  componentStack: 4000,
  errorMessage: 500,
  errorName: 100,
} as const;

export const clientErrorReportSchema = z.strictObject({
  errorName: z
    .string()
    .check(z.trim(), z.minLength(1), z.maxLength(clientErrorReportLimits.errorName)),
  errorMessage: z
    .string()
    .check(z.trim(), z.maxLength(clientErrorReportLimits.errorMessage)),
  componentStack: z.optional(
    z.string().check(z.maxLength(clientErrorReportLimits.componentStack)),
  ),
});

export const clientErrorReportReceiptSchema = z.strictObject({
  received: z.literal(true),
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
export type ClientErrorReportReceipt = z.infer<typeof clientErrorReportReceiptSchema>;
