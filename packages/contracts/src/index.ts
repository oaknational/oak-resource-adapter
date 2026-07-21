import * as z from "zod/mini";

export const resourceAdapterContractVersion = 1;

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

export const resourceAdapterCapabilityIdSchema = z.enum(["worksheetAdapter"]);

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
 * The lesson information the service needs to decide which resource-adapter
 * capabilities it offers. It deliberately does not include teacher identity or
 * authorisation claims.
 */
export const resourceAdapterCapabilitiesRequestSchema = z.object({
  contractVersion: z.literal(resourceAdapterContractVersion),
  lesson: lessonContextSchema,
});

export type ResourceAdapterCapabilitiesRequest = z.infer<
  typeof resourceAdapterCapabilitiesRequestSchema
>;
