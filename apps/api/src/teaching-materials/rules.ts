import { copyrightRule } from "../lesson-rules/copyright";
import { lessonStatusRule } from "../lesson-rules/lesson-status";
import { contentGuidanceRule } from "../rules/content-guidance";
import type { LessonFactsContext } from "../rules/context";
import { excludedLessonsRule } from "../rules/excluded-lessons";
import { pePracticalRule } from "../rules/pe-practical";
import type { Rule } from "../rules/rule";
import { subjectRule } from "../rules/subject";
import { subjectCategoryRule } from "../rules/subject-category";
import { MFL_SUBJECT_SLUGS } from "../rules/subject-groups";
import { subjectKeyStageRule } from "../rules/subject-key-stage";
import { OWA_RESTRICTED_LESSON_UIDS } from "./owa-restricted-lesson-uids";

/** Labs' own names, which its links take as `docType`. */
export const TEACHING_MATERIALS = [
  { id: "additional-glossary", label: "Glossary" },
  { id: "additional-comprehension", label: "Comprehension task" },
  { id: "additional-starter-quiz", label: "More starter quiz questions" },
  { id: "additional-exit-quiz", label: "More exit quiz questions" },
] as const;

export type TeachingMaterialId = (typeof TEACHING_MATERIALS)[number]["id"];

export const ALL_TEACHING_MATERIALS: readonly TeachingMaterialId[] =
  TEACHING_MATERIALS.map(({ id }) => id);

export const TEACHING_MATERIALS_LESSON_RULES = [
  lessonStatusRule(
    {
      id: "lesson-status",
      label: "Is published, current and not expired",
      condition: "The lesson isn't published, is a legacy lesson, or has expired",
    },
    { expiredFeatureKey: "expired" },
  ),
  subjectRule(
    {
      id: "subject",
      label: "Isn't in an excluded subject",
      condition: "The lesson is in one of these subjects",
    },
    {
      subjectSlugs: [
        "art",
        "french",
        "geography",
        "german",
        "music",
        "religious-education",
        "spanish",
      ],
    },
  ),
  copyrightRule(
    {
      id: "copyright",
      label: "Has no restricted copyright works",
      condition:
        "The lesson has restricted copyright works, a copyright conflict, or no clearance information",
      description: "Restricted media and downloadable files don't count.",
    },
    {
      restrictedLevels: ["restricted", "highly-restricted"],
      restrictedCategories: ["works"],
      conflictFeatureKeys: ["has_copyright_conflict"],
    },
  ),
  excludedLessonsRule(
    {
      id: "excluded-lessons",
      label: "Isn't on OWA's list of restricted lessons",
      condition: "The lesson is on OWA's list of restricted lessons",
    },
    { lessonSlugs: [], lessonUids: OWA_RESTRICTED_LESSON_UIDS },
  ),
  contentGuidanceRule(
    {
      id: "content-guidance",
      label: "Has no restricted content guidance",
      condition: "The lesson has any of this content guidance",
    },
    {
      labels: [
        "Depiction or discussion of sexual violence",
        "Depiction or discussion of sexual content",
        "Depiction or discussion of mental health issues",
        "Depiction or discussion of serious crime",
      ],
    },
  ),
] as const;

const WITHOUT_COMPREHENSION: readonly TeachingMaterialId[] = [
  "additional-glossary",
  "additional-starter-quiz",
  "additional-exit-quiz",
];

/** In order: the first rule that matches decides the lesson's materials. */
export const TEACHING_MATERIAL_SELECTIONS = [
  {
    rule: subjectCategoryRule(
      {
        id: "handwriting",
        label: "Handwriting",
        condition: "The lesson is in this subject category",
      },
      { categories: ["Handwriting"] },
    ),
    materials: ["additional-glossary", "additional-starter-quiz"],
  },
  {
    rule: subjectCategoryRule(
      {
        id: "spelling",
        label: "Spelling",
        condition: "The lesson is in this subject category",
      },
      { categories: ["Spelling"] },
    ),
    materials: WITHOUT_COMPREHENSION,
  },
  {
    rule: pePracticalRule({
      id: "pe-practical",
      label: "Practical PE",
      condition: "The lesson is a practical PE lesson",
    }),
    materials: WITHOUT_COMPREHENSION,
  },
  {
    rule: subjectKeyStageRule(
      {
        id: "no-comprehension-ks1-4",
        label: "No comprehension task at any key stage",
        condition: "The lesson is opened in one of these subjects",
      },
      {
        subjectSlugs: ["maths", "financial-education", "digital-literacy"],
        keyStageSlugs: ["ks1", "ks2", "ks3", "ks4"],
      },
    ),
    materials: WITHOUT_COMPREHENSION,
  },
  {
    rule: subjectKeyStageRule(
      {
        id: "no-comprehension-ks1",
        label: "No comprehension task at KS1",
        condition: "The lesson is opened in one of these subjects",
      },
      {
        subjectSlugs: ["art", "computing", "religious-education"],
        keyStageSlugs: ["ks1"],
      },
    ),
    materials: WITHOUT_COMPREHENSION,
  },
  {
    rule: subjectKeyStageRule(
      {
        id: "no-exit-quiz-ks4",
        label: "No exit quiz at KS4",
        condition: "The lesson is opened in one of these subjects",
      },
      { subjectSlugs: ["art"], keyStageSlugs: ["ks4"] },
    ),
    materials: [
      "additional-glossary",
      "additional-comprehension",
      "additional-starter-quiz",
    ],
  },
  {
    rule: subjectKeyStageRule(
      {
        id: "quizzes-only",
        label: "Quizzes only",
        condition: "The lesson is opened in one of these subjects",
      },
      { subjectSlugs: MFL_SUBJECT_SLUGS, keyStageSlugs: ["ks2", "ks3", "ks4"] },
    ),
    materials: ["additional-starter-quiz", "additional-exit-quiz"],
  },
] as const satisfies readonly Readonly<{
  rule: Rule<LessonFactsContext>;
  materials: readonly TeachingMaterialId[];
}>[];
