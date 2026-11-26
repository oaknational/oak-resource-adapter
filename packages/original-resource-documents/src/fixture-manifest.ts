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

export type OakWorksheetFixtureEntry = OriginalResourceDocumentFixtureManifestEntry &
  Readonly<{ oakLesson: OakLessonFixtureMetadata }>;

const oakOriginalFileResourceTypes: readonly string[] = [
  "slide-deck",
  "worksheet",
  "worksheet-answers",
  "exit-quiz",
  "exit-quiz-answers",
  "starter-quiz",
  "starter-quiz-answers",
];

const oakOriginalFileResourceTypesWithSupplementary =
  oakOriginalFileResourceTypes.toSpliced(1, 0, "supplementary");

const oakLessonBaseUrl = "https://www.thenational.academy/teachers/lessons";
const oakRights =
  "Oak worksheet verified: the lesson passes ORA's lesson rules for a teacher outside every copyright region.";
const rightsCheckedOn = "2026-11-09";

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
    rightsCheckedOn?: string;
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
      rightsCheckedOn: lesson.rightsCheckedOn ?? rightsCheckedOn,
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
    originalFileResourceTypes: oakOriginalFileResourceTypesWithSupplementary,
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
    lessonSlug: "what-greek-myths-can-tell-us-about-ancient-greece",
    title: "What Greek myths can tell us about Ancient Greece",
    description:
      "Provisional worksheet extraction for Oak KS2 History; tables and diagrams adapted for parser coverage.",
    programmeSlug: "history-primary-ks2",
    keyStage: "KS2",
    keyStageSlug: "ks2",
    subject: "History",
    subjectSlug: "history",
    unitSlug: "ancient-greek-civilisation-what-do-we-know-about-ancient-greece",
    unitTitle: "Ancient Greek civilisation: what do we know about ancient Greece?",
    contentGuidance: ["Depiction or discussion of sensitive content"],
  }),
  oakWorksheetFixture({
    lessonSlug: "what-we-know-about-ancient-greece",
    title: "What we know about Ancient Greece",
    description:
      "Provisional worksheet extraction for Oak KS2 History; tables adapted for parser coverage.",
    programmeSlug: "history-primary-ks2",
    keyStage: "KS2",
    keyStageSlug: "ks2",
    subject: "History",
    subjectSlug: "history",
    unitSlug: "ancient-greek-civilisation-what-do-we-know-about-ancient-greece",
    unitTitle: "Ancient Greek civilisation: what do we know about ancient Greece?",
    contentGuidance: [
      "Depiction or discussion of discriminatory behaviour",
      "Depiction or discussion of sensitive content",
      "Depiction or discussion of violence or suffering",
    ],
  }),
  oakWorksheetFixture({
    lessonSlug: "subordination-with-because",
    title: "Subordination with ‘because’",
    description: "Provisional extraction markup for an Oak KS1 English worksheet.",
    programmeSlug: "english-primary-ks1",
    keyStage: "KS1",
    keyStageSlug: "ks1",
    subject: "English",
    subjectSlug: "english",
    unitSlug: "adverbial-complex-sentences",
    unitTitle: "Adverbial complex sentences",
    rightsCheckedOn: "2026-11-19",
  }),
  oakWorksheetFixture({
    lessonSlug: "analysing-in-flanders-fields",
    title: "Analysing John McCrae’s call to arms in ‘In Flanders Fields’",
    description:
      "Provisional extraction markup for an Oak KS3 English worksheet; bulleted prompts adapted as tables.",
    programmeSlug: "english-secondary-ks3",
    keyStage: "KS3",
    keyStageSlug: "ks3",
    subject: "English",
    subjectSlug: "english",
    unitSlug: "a-world-at-war-poetry",
    unitTitle: "Comparing poetry from the First World War",
    contentGuidance: ["Depiction or discussion of violence or suffering"],
    originalFileResourceTypes: oakOriginalFileResourceTypesWithSupplementary,
    rightsCheckedOn: "2026-11-19",
  }),
  oakWorksheetFixture({
    lessonSlug: "checking-and-securing-understanding-of-multiplication-and-division",
    title: "Checking and securing understanding of multiplication and division",
    description:
      "Provisional extraction markup for an Oak KS3 maths worksheet; answer spaces adapted as tables.",
    programmeSlug: "maths-secondary-ks3",
    keyStage: "KS3",
    keyStageSlug: "ks3",
    subject: "Maths",
    subjectSlug: "maths",
    unitSlug: "arithmetic-procedures-with-integers-and-decimals",
    unitTitle: "Arithmetic procedures with integers and decimals",
    rightsCheckedOn: "2026-11-19",
  }),
  oakWorksheetFixture({
    lessonSlug: "formation-of-fossil-fuels",
    title: "Formation of fossil fuels",
    description:
      "Provisional extraction markup for an Oak KS3 science worksheet; statement lists adapted as tables.",
    programmeSlug: "science-secondary-ks3",
    keyStage: "KS3",
    keyStageSlug: "ks3",
    subject: "Science",
    subjectSlug: "science",
    unitSlug: "carbon-cycle-and-climate-change",
    unitTitle: "Carbon cycle and climate change",
    rightsCheckedOn: "2026-11-19",
  }),
  oakWorksheetFixture({
    lessonSlug: "what-is-the-rule-of-law-and-how-does-it-support-a-fair-society",
    title: "What is the rule of law, and how does it support a fair society?",
    description: "Provisional extraction markup for an Oak KS3 citizenship worksheet.",
    programmeSlug: "citizenship-secondary-ks3",
    keyStage: "KS3",
    keyStageSlug: "ks3",
    subject: "Citizenship",
    subjectSlug: "citizenship",
    unitSlug: "how-does-the-rule-of-law-contribute-to-fairness",
    unitTitle: "How does the rule of law contribute to fairness?",
    contentGuidance: ["Depiction or discussion of discriminatory behaviour"],
    originalFileResourceTypes: oakOriginalFileResourceTypesWithSupplementary,
    rightsCheckedOn: "2026-11-19",
  }),
  oakWorksheetFixture({
    lessonSlug: "calculating-specific-heat-capacity-e-equals-m-c",
    title: "Calculating specific heat capacity (ΔE = m c Δθ)",
    description: "Provisional extraction markup for an Oak KS4 physics worksheet.",
    programmeSlug: "physics-secondary-ks4-foundation-aqa",
    keyStage: "KS4",
    keyStageSlug: "ks4",
    subject: "Physics",
    subjectSlug: "physics",
    examBoard: "AQA",
    tier: "foundation",
    unitSlug: "energy-of-moving-particles",
    unitTitle: "Energy of moving particles",
    rightsCheckedOn: "2026-11-19",
  }),
  oakWorksheetFixture({
    lessonSlug: "design-specification",
    title: "Design specification",
    description:
      "Provisional extraction markup for an Oak KS4 design and technology worksheet; specifications adapted as tables.",
    programmeSlug: "design-technology-secondary-ks4",
    keyStage: "KS4",
    keyStageSlug: "ks4",
    subject: "Design and technology",
    subjectSlug: "design-technology",
    unitSlug: "designing-and-making-principles",
    unitTitle: "Designing and Making Principles",
    rightsCheckedOn: "2026-11-19",
  }),
] as const satisfies readonly OriginalResourceDocumentFixtureManifestEntry[];
