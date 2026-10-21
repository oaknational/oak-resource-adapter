import type { ResourceDocument } from "@oaknational/resource-document";
import { z } from "zod";

export const lessonIdentitySchema = z.strictObject({
  lessonSlug: z.string().trim().min(1),
  programmeSlug: z.string().trim().min(1),
});

/** Left unknown: the API parses it with `parseResourceDocument`, which also upgrades older schema versions. */
export const resourceDocumentInputSchema = z.unknown();

/** A request as a client builds it, with a current document in place of the unknown the API parses. */
export type WithResourceDocument<TRequest> = Omit<TRequest, "document"> &
  Readonly<{ document: ResourceDocument }>;
