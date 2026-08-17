import { ResourceDocumentParseError } from "@oaknational/resource-document";
import { parseResourceMarkup } from "@oaknational/resource-document/markup";

import {
  OriginalResourceDocumentError,
  type OriginalResourceDocumentLocator,
  type OriginalResourceDocumentProvider,
  type OriginalResourceDocumentReader,
  type OriginalResourceLessonRef,
} from "./contract.js";
import { fixtureOriginalResourceDocumentProvider } from "./fixtures.js";

export {
  OriginalResourceDocumentError,
  type OriginalResourceDocumentErrorCode,
  type OriginalResourceDocumentLocator,
  type OriginalResourceDocumentProvider,
  type OriginalResourceDocumentReader,
  type OriginalResourceLessonRef,
} from "./contract.js";

function assertUsableLessonRef(lesson: OriginalResourceLessonRef): void {
  if (lesson.source !== "oak") {
    throw new OriginalResourceDocumentError(
      `Unsupported source ${JSON.stringify(lesson.source)}.`,
      { code: "invalid-locator", locator: lesson },
    );
  }

  const blankField = (["lessonSlug", "programmeSlug"] as const).find(
    (field) => lesson[field].trim().length === 0,
  );

  if (blankField !== undefined) {
    throw new OriginalResourceDocumentError(`${blankField} must not be blank.`, {
      code: "invalid-locator",
      locator: lesson,
    });
  }
}

function assertUsableLocator(locator: OriginalResourceDocumentLocator): void {
  assertUsableLessonRef(locator);

  if (locator.resourceType.trim().length === 0) {
    throw new OriginalResourceDocumentError("resourceType must not be blank.", {
      code: "invalid-locator",
      locator,
    });
  }
}

function asReaderError(
  error: unknown,
  locator: OriginalResourceLessonRef,
): OriginalResourceDocumentError {
  if (error instanceof OriginalResourceDocumentError) {
    return error;
  }

  if (error instanceof ResourceDocumentParseError) {
    return new OriginalResourceDocumentError(
      "The source returned extraction markup this version cannot read.",
      { cause: error, code: "malformed-document", locator },
    );
  }

  return new OriginalResourceDocumentError(
    "The original resource document could not be retrieved.",
    { cause: error, code: "upstream-unavailable", locator },
  );
}

export function createOriginalResourceDocumentReader(
  provider: OriginalResourceDocumentProvider,
): OriginalResourceDocumentReader {
  return {
    async get(locator) {
      assertUsableLocator(locator);

      try {
        return parseResourceMarkup(await provider.getMarkup(locator));
      } catch (error) {
        throw asReaderError(error, locator);
      }
    },

    async getMarkup(locator) {
      assertUsableLocator(locator);

      try {
        return await provider.getMarkup(locator);
      } catch (error) {
        throw asReaderError(error, locator);
      }
    },

    async listExtractedResourceTypes(lesson) {
      assertUsableLessonRef(lesson);

      try {
        return await provider.listExtractedResourceTypes(lesson);
      } catch (error) {
        throw asReaderError(error, lesson);
      }
    },
  };
}

export const originalResourceDocuments = createOriginalResourceDocumentReader(
  fixtureOriginalResourceDocumentProvider,
);
