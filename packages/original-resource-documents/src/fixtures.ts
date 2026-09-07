import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ResourceDocument } from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";

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
  /** Last successful live rights check; not an ongoing clearance guarantee. */
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

export type OakWorksheetFixtureEntry = OriginalResourceDocumentFixtureManifestEntry &
  Readonly<{ oakLesson: OakLessonFixtureMetadata }>;

const oakOriginalFileResourceTypes = [
  "slide-deck",
  "worksheet",
  "worksheet-answers",
  "exit-quiz",
  "exit-quiz-answers",
  "starter-quiz",
  "starter-quiz-answers",
] as const;

const oakLessonBaseUrl = "https://www.thenational.academy/teachers/lessons";
const oakRights =
  "Oak worksheet verified: every recorded third-party material restriction is OGL compatible or OGL equivalent, or no restriction is recorded.";
const rightsCheckedOn = "2026-09-07";

function oakWorksheetFixture(
  lesson: Readonly<{
    lessonSlug: string;
    title: string;
    description: string;
    programmeSlug: string;
    keyStage: string;
    keyStageSlug: string;
    subject: string;
    subjectSlug: string;
    examBoard?: string;
    tier?: string;
    contentGuidance?: readonly string[];
    originalFileResourceTypes?: readonly string[];
    unitSlug: string;
    unitTitle: string;
  }>,
): OakWorksheetFixtureEntry {
  return {
    id: lesson.lessonSlug,
    title: lesson.title,
    description: lesson.description,
    markupVersion: "0.1",
    schemaVersion: "0.1",
    profile: "worksheet.v0",
    rights: oakRights,
    oakLesson: {
      lessonSlug: lesson.lessonSlug,
      programmeSlug: lesson.programmeSlug,
      sourceUrl: `${oakLessonBaseUrl}/${lesson.lessonSlug}`,
      rightsCheckedOn,
      programme: {
        examBoard: lesson.examBoard ?? null,
        keyStage: lesson.keyStage,
        keyStageSlug: lesson.keyStageSlug,
        subject: lesson.subject,
        subjectSlug: lesson.subjectSlug,
        tier: lesson.tier ?? null,
      },
      unit: { slug: lesson.unitSlug, title: lesson.unitTitle },
      contentGuidance: lesson.contentGuidance ?? [],
      originalFileResourceTypes:
        lesson.originalFileResourceTypes ?? oakOriginalFileResourceTypes,
    },
  };
}

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
  oakWorksheetFixture({
    lessonSlug:
      "explain-how-the-quotient-is-affected-when-the-divisor-is-equal-to-the-dividend",
    title:
      "Explain how the quotient is affected when the divisor is equal to the dividend",
    description: "Provisional extraction markup for an Oak KS1 maths worksheet.",
    programmeSlug: "maths-primary-ks1",
    keyStage: "KS1",
    keyStageSlug: "ks1",
    subject: "Maths",
    subjectSlug: "maths",
    unitSlug: "doubling-halving-quotative-and-partitive-division",
    unitTitle: "Doubling, halving, quotative and partitive division",
  }),
  oakWorksheetFixture({
    lessonSlug: "adopting-different-perspectives",
    title: "Adopting different perspectives",
    description: "Provisional extraction markup for an Oak KS2 English worksheet.",
    programmeSlug: "english-primary-ks2",
    keyStage: "KS2",
    keyStageSlug: "ks2",
    subject: "English",
    subjectSlug: "english",
    unitSlug: "a-kind-of-spark-narrative-writing",
    unitTitle: "'A Kind of Spark': narrative writing",
  }),
  oakWorksheetFixture({
    lessonSlug: "forming-ions-for-ionic-bonding",
    title: "Forming ions for ionic bonding",
    description: "Provisional extraction markup for an Oak KS4 chemistry worksheet.",
    programmeSlug: "chemistry-secondary-ks4-higher-aqa",
    keyStage: "KS4",
    keyStageSlug: "ks4",
    subject: "Chemistry",
    subjectSlug: "chemistry",
    examBoard: "AQA",
    tier: "higher",
    unitSlug: "structure-and-bonding",
    unitTitle: "Structure and bonding",
  }),
  oakWorksheetFixture({
    lessonSlug: "using-trace-tables",
    title: "Using trace tables",
    description: "Provisional extraction markup for an Oak KS4 computing worksheet.",
    programmeSlug: "computing-secondary-ks4-gcse-aqa",
    keyStage: "KS4",
    keyStageSlug: "ks4",
    subject: "Computing",
    subjectSlug: "computing",
    examBoard: "AQA",
    unitSlug: "programming-iteration",
    unitTitle: "Programming: iteration",
  }),
  oakWorksheetFixture({
    lessonSlug: "accidents-and-emergencies-er-verbs-in-the-perfect-tense-with-etre",
    title: "Accidents and emergencies: -er verbs in the perfect tense with 'être'",
    description:
      "Provisional worksheet excerpt for Oak KS3 French; tables and diagrams adapted for parser coverage.",
    programmeSlug: "french-secondary-ks3",
    keyStage: "KS3",
    keyStageSlug: "ks3",
    subject: "French",
    subjectSlug: "french",
    unitSlug: "past-and-present-events-perfect-tense-negation-questions",
    unitTitle: "Past and present events: perfect tense, negation, questions",
    originalFileResourceTypes: [
      "slide-deck",
      "supplementary",
      "worksheet",
      "worksheet-answers",
      "exit-quiz",
      "exit-quiz-answers",
      "starter-quiz",
      "starter-quiz-answers",
    ],
  }),
  oakWorksheetFixture({
    lessonSlug: "actions-to-tackle-climate-change",
    title: "Actions to tackle climate change",
    description:
      "Provisional worksheet excerpt for Oak KS3 Geography; tables and diagrams adapted for parser coverage.",
    programmeSlug: "geography-secondary-ks3",
    keyStage: "KS3",
    keyStageSlug: "ks3",
    subject: "Geography",
    subjectSlug: "geography",
    unitSlug: "weather-and-climate-why-does-our-weather-and-climate-change",
    unitTitle: "Weather and climate: how do they vary?",
  }),
  oakWorksheetFixture({
    lessonSlug: "air-resistance-do-and-review",
    title: "Air resistance: do and review",
    description:
      "Provisional worksheet excerpt for Oak KS2 Science; tables and diagrams adapted for parser coverage.",
    programmeSlug: "science-primary-ks2",
    keyStage: "KS2",
    keyStageSlug: "ks2",
    subject: "Science",
    subjectSlug: "science",
    unitSlug: "forces-including-simple-machines",
    unitTitle: "Forces including simple machines",
    contentGuidance: ["Risk assessment required - equipment"],
    originalFileResourceTypes: [
      "slide-deck",
      "supplementary",
      "worksheet",
      "worksheet-answers",
      "exit-quiz",
      "exit-quiz-answers",
      "starter-quiz",
      "starter-quiz-answers",
    ],
  }),
  oakWorksheetFixture({
    lessonSlug: "the-river-nile",
    title: "The River Nile",
    description:
      "Provisional worksheet excerpt for Oak KS2 History; tables and diagrams adapted for parser coverage.",
    programmeSlug: "history-primary-ks2",
    keyStage: "KS2",
    keyStageSlug: "ks2",
    subject: "History",
    subjectSlug: "history",
    unitSlug: "ancient-egypt-what-stayed-the-same-across-3-000-years",
    unitTitle: "Ancient Egypt: what stayed the same across 3,000 years?",
  }),
  oakWorksheetFixture({
    lessonSlug: "adrenaline-thyroxine-and-negative-feedback",
    title: "Adrenaline, thyroxine and negative feedback",
    description:
      "Provisional worksheet excerpt for Oak KS4 Biology; tables and diagrams adapted for parser coverage.",
    programmeSlug: "biology-secondary-ks4-higher-aqa",
    keyStage: "KS4",
    keyStageSlug: "ks4",
    subject: "Biology",
    subjectSlug: "biology",
    unitSlug: "coordination-and-control-hormones-and-the-human-endocrine-system",
    unitTitle: "Coordination and control: hormones and the human endocrine system",
    examBoard: "AQA",
    tier: "higher",
  }),
  oakWorksheetFixture({
    lessonSlug: "adding-rhythmic-variation-to-ground-bass",
    title: "Adding rhythmic variation to ground bass",
    description:
      "Provisional worksheet excerpt for Oak KS3 Music; tables and diagrams adapted for parser coverage.",
    programmeSlug: "music-secondary-ks3",
    keyStage: "KS3",
    keyStageSlug: "ks3",
    subject: "Music",
    subjectSlug: "music",
    unitSlug: "harmonic-progressions-bass-lines-and-shuffle",
    unitTitle: "Harmonic progressions and bass lines",
  }),
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
