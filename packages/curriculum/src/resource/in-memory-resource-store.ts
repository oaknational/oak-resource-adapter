import {
  findLessonResource,
  resourceUnavailable,
  type LessonResourceType,
  type LessonWithResources,
  type ResourceFile,
  type ResourceStore,
} from "./resource.js";

/** Keyed by `lessonSlug:type`; use {@link resourceKey} to build them. */
export function createInMemoryResourceStore(
  files: ReadonlyMap<string, ResourceFile> = new Map(),
): ResourceStore {
  return {
    async fetch(
      lesson: LessonWithResources,
      type: LessonResourceType,
    ): Promise<ResourceFile> {
      const file =
        findLessonResource(lesson, type) === undefined
          ? undefined
          : files.get(resourceKey(lesson.identity.lessonSlug, type));

      if (file === undefined) {
        throw resourceUnavailable(lesson, type);
      }

      return file;
    },
  };
}

export function resourceKey(lessonSlug: string, type: LessonResourceType): string {
  return `${lessonSlug}:${type}`;
}

export function buildResourceFile(overrides: Partial<ResourceFile> = {}): ResourceFile {
  return {
    bytes: new TextEncoder().encode("%PDF-1.7 a worksheet"),
    contentType: "application/pdf",
    type: "worksheet",
    ...overrides,
  };
}
