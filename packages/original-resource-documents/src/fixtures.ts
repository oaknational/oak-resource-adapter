import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseResourceDocument,
  type ResourceDocument,
} from "@oaknational/resource-document";

import {
  OriginalResourceDocumentError,
  type OriginalResourceDocumentProvider,
} from "./contract.js";

/** The corpus holds exactly one extraction, the worksheet, per Oak lesson. */
const fixtureResourceType = "worksheet";

export interface OriginalResourceDocumentFixtureManifestEntry {
  id: string;
  title: string;
  description: string;
  markupVersion: string;
  schemaVersion: string;
  profile: string;
  /** Human-readable clearance statement, not a licence identifier. */
  rights: string;
  oakLesson?: OakLessonFixtureMetadata;
}

export interface OakLessonFixtureMetadata {
  lessonSlug: string;
  programmeSlug: string;
  sourceUrl: string;
  /**
   * When this lesson last passed scripts/verify-original-resource-document-fixture-rights.mjs.
   * The corpus is a snapshot, so the date is the claim, not an ongoing guarantee.
   */
  rightsCheckedOn: string;
  programme: {
    examBoard: string | null;
    keyStage: string;
    keyStageSlug: string;
    subject: string;
    subjectSlug: string;
    tier: string | null;
  };
  unit: {
    slug: string;
    title: string;
  };
  contentGuidance: readonly string[];
  originalFileResourceTypes: readonly string[];
}

export interface LoadedOriginalResourceDocumentFixture {
  manifest: OriginalResourceDocumentFixtureManifestEntry;
  markup: string;
  expectedDocument: ResourceDocument;
}

const oakOriginalFileResourceTypes = [
  "slide-deck",
  "worksheet",
  "worksheet-answers",
  "exit-quiz",
  "exit-quiz-answers",
  "starter-quiz",
  "starter-quiz-answers",
] as const;

export const originalResourceDocumentFixtureManifest = [
  {
    id: "linear-equations-smoke",
    title: "Exploring linear equations",
    description:
      "Synthetic worksheet fixture derived from the initial design screenshots.",
    markupVersion: "0.1",
    schemaVersion: "0.1",
    profile: "worksheet.v0",
    rights: "Synthetic test content committed under the repository licence.",
  },
  {
    id: "explain-how-the-quotient-is-affected-when-the-divisor-is-equal-to-the-dividend",
    title:
      "Explain how the quotient is affected when the divisor is equal to the dividend",
    description: "Provisional extraction markup for an Oak KS1 maths worksheet.",
    markupVersion: "0.1",
    schemaVersion: "0.1",
    profile: "worksheet.v0",
    rights: "Oak lesson verified with no recorded third-party material restrictions.",
    oakLesson: {
      lessonSlug:
        "explain-how-the-quotient-is-affected-when-the-divisor-is-equal-to-the-dividend",
      programmeSlug: "maths-primary-ks1",
      sourceUrl:
        "https://www.thenational.academy/teachers/lessons/explain-how-the-quotient-is-affected-when-the-divisor-is-equal-to-the-dividend",
      rightsCheckedOn: "2026-08-17",
      programme: {
        examBoard: null,
        keyStage: "KS1",
        keyStageSlug: "ks1",
        subject: "Maths",
        subjectSlug: "maths",
        tier: null,
      },
      unit: {
        slug: "doubling-halving-quotative-and-partitive-division",
        title: "Doubling, halving, quotative and partitive division",
      },
      contentGuidance: [],
      originalFileResourceTypes: oakOriginalFileResourceTypes,
    },
  },
  {
    id: "adopting-different-perspectives",
    title: "Adopting different perspectives",
    description: "Provisional extraction markup for an Oak KS2 English worksheet.",
    markupVersion: "0.1",
    schemaVersion: "0.1",
    profile: "worksheet.v0",
    rights: "Oak lesson verified with no recorded third-party material restrictions.",
    oakLesson: {
      lessonSlug: "adopting-different-perspectives",
      programmeSlug: "english-primary-ks2",
      sourceUrl:
        "https://www.thenational.academy/teachers/lessons/adopting-different-perspectives",
      rightsCheckedOn: "2026-08-17",
      programme: {
        examBoard: null,
        keyStage: "KS2",
        keyStageSlug: "ks2",
        subject: "English",
        subjectSlug: "english",
        tier: null,
      },
      unit: {
        slug: "a-kind-of-spark-narrative-writing",
        title: "'A Kind of Spark': narrative writing",
      },
      contentGuidance: [],
      originalFileResourceTypes: oakOriginalFileResourceTypes,
    },
  },
  {
    id: "composing-in-a-samba-style",
    title: "Composing in a samba style",
    description: "Provisional extraction markup for an Oak KS3 music worksheet.",
    markupVersion: "0.1",
    schemaVersion: "0.1",
    profile: "worksheet.v0",
    rights: "Oak lesson verified with no recorded third-party material restrictions.",
    oakLesson: {
      lessonSlug: "composing-in-a-samba-style",
      programmeSlug: "music-secondary-ks3",
      sourceUrl:
        "https://www.thenational.academy/teachers/lessons/composing-in-a-samba-style",
      rightsCheckedOn: "2026-08-17",
      programme: {
        examBoard: null,
        keyStage: "KS3",
        keyStageSlug: "ks3",
        subject: "Music",
        subjectSlug: "music",
        tier: null,
      },
      unit: {
        slug: "the-bass-hooks-and-grooves-of-80s-pop-5262",
        title: "Samba music",
      },
      contentGuidance: [],
      originalFileResourceTypes: oakOriginalFileResourceTypes,
    },
  },
  {
    id: "forming-ions-for-ionic-bonding",
    title: "Forming ions for ionic bonding",
    description: "Provisional extraction markup for an Oak KS4 chemistry worksheet.",
    markupVersion: "0.1",
    schemaVersion: "0.1",
    profile: "worksheet.v0",
    rights: "Oak lesson verified with no recorded third-party material restrictions.",
    oakLesson: {
      lessonSlug: "forming-ions-for-ionic-bonding",
      programmeSlug: "chemistry-secondary-ks4-higher-aqa",
      sourceUrl:
        "https://www.thenational.academy/teachers/lessons/forming-ions-for-ionic-bonding",
      rightsCheckedOn: "2026-08-17",
      programme: {
        examBoard: "AQA",
        keyStage: "KS4",
        keyStageSlug: "ks4",
        subject: "Chemistry",
        subjectSlug: "chemistry",
        tier: "higher",
      },
      unit: {
        slug: "structure-and-bonding",
        title: "Structure and bonding",
      },
      contentGuidance: [],
      originalFileResourceTypes: oakOriginalFileResourceTypes,
    },
  },
  {
    id: "using-trace-tables",
    title: "Using trace tables",
    description: "Provisional extraction markup for an Oak KS4 computing worksheet.",
    markupVersion: "0.1",
    schemaVersion: "0.1",
    profile: "worksheet.v0",
    rights: "Oak lesson verified with no recorded third-party material restrictions.",
    oakLesson: {
      lessonSlug: "using-trace-tables",
      programmeSlug: "computing-secondary-ks4-gcse-aqa",
      sourceUrl: "https://www.thenational.academy/teachers/lessons/using-trace-tables",
      rightsCheckedOn: "2026-08-17",
      programme: {
        examBoard: "AQA",
        keyStage: "KS4",
        keyStageSlug: "ks4",
        subject: "Computing",
        subjectSlug: "computing",
        tier: null,
      },
      unit: {
        slug: "programming-iteration",
        title: "Programming: iteration",
      },
      contentGuidance: [],
      originalFileResourceTypes: oakOriginalFileResourceTypes,
    },
  },
] as const satisfies readonly OriginalResourceDocumentFixtureManifestEntry[];

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
