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

/** `needsSetup`: the teacher has not completed OWA onboarding, so no ORA capabilities are offered. */
export const resourceAdapterAccountSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("needsSetup") }),
  z.object({
    state: z.literal("ready"),
    tier: z.enum(["full", "limited"]),
    inCopyrightRegion: z.boolean(),
  }),
]);

/** Labs' names for its teaching materials, which its links take as `docType`. */
export const teachingMaterialIdSchema = nonEmptyStringSchema;

/** Decided by their own rules: a lesson ORA refuses can still get them. */
const teachingMaterialsSchema = z.readonly(z.array(teachingMaterialIdSchema));

export const resourceAdapterCapabilitiesResponseSchema = z.object({
  account: resourceAdapterAccountSchema,
  capabilities: z.readonly(z.array(resourceAdapterCapabilitySchema)),
  /** For `needsSetup`, whether ORA has anything for the lesson once setup is done. */
  available: z.boolean(),
  teachingMaterials: teachingMaterialsSchema,
});

/**
 * `supportedCapabilityIds` is what the calling package can render. Omitting it
 * asks about every capability the service knows, which overstates availability
 * for a host older than the service.
 */
export const resourceAdapterCapabilitiesRequestSchema = z.extend(lessonContextSchema, {
  supportedCapabilityIds: z.optional(z.array(resourceAdapterCapabilityIdSchema)),
});

export const resourceAdapterCapabilityAvailabilityRequestSchema =
  resourceAdapterCapabilitiesRequestSchema;

export const resourceAdapterCapabilityAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  teachingMaterials: teachingMaterialsSchema,
});

export type ResourceAdapterCapabilityId = z.infer<
  typeof resourceAdapterCapabilityIdSchema
>;
export type ResourceAdapterCapability = z.infer<typeof resourceAdapterCapabilitySchema>;
export type ResourceAdapterAccount = z.infer<typeof resourceAdapterAccountSchema>;
export type ResourceAdapterCapabilitiesResponse = z.infer<
  typeof resourceAdapterCapabilitiesResponseSchema
>;

export type ResourceAdapterCapabilityAvailabilityResponse = z.infer<
  typeof resourceAdapterCapabilityAvailabilityResponseSchema
>;

export type ResourceAdapterCapabilitiesRequest = z.infer<
  typeof resourceAdapterCapabilitiesRequestSchema
>;

export type ResourceAdapterCapabilityAvailabilityRequest = z.infer<
  typeof resourceAdapterCapabilityAvailabilityRequestSchema
>;
