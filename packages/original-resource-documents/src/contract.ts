import type { ResourceDocument } from "@oaknational/resource-document";

export type OriginalResourceLessonRef = Readonly<{
  source: "oak";
  lessonSlug: string;
  programmeSlug: string;
}>;

/**
 * `resourceType` is an opaque non-empty identifier: the provider, not this
 * lookup contract, decides which resource kinds it can supply.
 */
export type OriginalResourceDocumentLocator = OriginalResourceLessonRef &
  Readonly<{ resourceType: string }>;

export type OriginalResourceDocumentErrorCode =
  "invalid-locator" | "malformed-document" | "not-found" | "upstream-unavailable";

export class OriginalResourceDocumentError extends Error {
  readonly code: OriginalResourceDocumentErrorCode;
  readonly locator: OriginalResourceLessonRef;

  constructor(
    message: string,
    options: ErrorOptions & {
      code: OriginalResourceDocumentErrorCode;
      locator: OriginalResourceLessonRef;
    },
  ) {
    super(message, options);
    this.name = "OriginalResourceDocumentError";
    this.code = options.code;
    this.locator = options.locator;
  }
}

/**
 * Providers deal in extraction markup, which is what the extraction service
 * hands over. The reader owns the parse, so no caller sees unparsed markup
 * unless it asks for it.
 */
export interface OriginalResourceDocumentProvider {
  getMarkup(locator: OriginalResourceDocumentLocator): Promise<string>;
  listExtractedResourceTypes(
    lesson: OriginalResourceLessonRef,
  ): Promise<readonly string[]>;
}

export interface OriginalResourceDocumentReader {
  get(locator: OriginalResourceDocumentLocator): Promise<ResourceDocument>;
  getMarkup(locator: OriginalResourceDocumentLocator): Promise<string>;
  listExtractedResourceTypes(
    lesson: OriginalResourceLessonRef,
  ): Promise<readonly string[]>;
}
