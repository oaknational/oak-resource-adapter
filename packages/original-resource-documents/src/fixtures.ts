import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ResourceDocument } from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";

import {
  OriginalResourceDocumentError,
  type OriginalResourceDocumentProvider,
} from "./contract.js";

import {
  originalResourceDocumentFixtureManifest,
  type OriginalResourceDocumentFixtureManifestEntry,
} from "./fixture-manifest.js";

export {
  originalResourceDocumentFixtureManifest,
  type OriginalResourceDocumentFixtureManifestEntry,
  type OakLessonFixtureMetadata,
  type OakWorksheetFixtureEntry,
} from "./fixture-manifest.js";

/** The corpus holds exactly one extraction, the worksheet, per Oak lesson. */
const fixtureResourceType = "worksheet";

export interface LoadedOriginalResourceDocumentFixture {
  manifest: OriginalResourceDocumentFixtureManifestEntry;
  markup: string;
  expectedDocument: ResourceDocument;
}

const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function findManifestEntry(id: string) {
  const manifest = originalResourceDocumentFixtureManifest.find(
    (entry) => entry.id === id,
  );

  if (!manifest) {
    throw new Error(
      `Unknown original resource document fixture ${JSON.stringify(id)}.`,
    );
  }

  return manifest;
}

function readFixtureMarkup(id: string): Promise<string> {
  return readFile(join(fixturesDirectory, id, "extracted.mmd"), "utf8");
}

export async function loadOriginalResourceDocumentFixture(
  id: string,
): Promise<LoadedOriginalResourceDocumentFixture> {
  const manifest = findManifestEntry(id);
  const [markup, expectedJson] = await Promise.all([
    readFixtureMarkup(id),
    readFile(join(fixturesDirectory, id, "expected/document.json"), "utf8"),
  ]);

  return {
    manifest,
    markup,
    expectedDocument: parseResourceDocument(JSON.parse(expectedJson) as unknown),
  };
}

function findOakFixture(lessonSlug: string, programmeSlug: string) {
  return originalResourceDocumentFixtureManifest.find(
    (entry) =>
      "oakLesson" in entry &&
      entry.oakLesson.lessonSlug === lessonSlug &&
      entry.oakLesson.programmeSlug === programmeSlug,
  );
}

export const fixtureOriginalResourceDocumentProvider: OriginalResourceDocumentProvider =
  {
    async getMarkup(locator) {
      const fixture = findOakFixture(locator.lessonSlug, locator.programmeSlug);

      if (fixture === undefined || locator.resourceType !== fixtureResourceType) {
        throw new OriginalResourceDocumentError(
          `No extraction markup matches ${JSON.stringify(locator)}.`,
          { code: "not-found", locator },
        );
      }

      return readFixtureMarkup(fixture.id);
    },

    listExtractedResourceTypes(lesson) {
      const fixture = findOakFixture(lesson.lessonSlug, lesson.programmeSlug);

      return Promise.resolve(fixture === undefined ? [] : [fixtureResourceType]);
    },
  };
