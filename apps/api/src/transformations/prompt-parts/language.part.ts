/** The ages a key stage teaches, so a prompt can state them rather than imply them. */
const KEY_STAGE_AGES: Readonly<Record<string, string>> = {
  ks1: "5 to 7",
  ks2: "7 to 11",
  ks3: "11 to 14",
  ks4: "14 to 16",
  ks5: "16 to 18",
};

type CurriculumLabel = Readonly<{ id: string; label?: string | undefined }>;

export type LanguageContext = Readonly<{
  keyStage?: CurriculumLabel | undefined;
  targetReadingAge?: number | undefined;
  yearGroup?: CurriculumLabel | undefined;
}>;

/** "Year 6, Key stage 2, aged 7 to 11", or undefined when the resource names neither. */
export function describeCohort({
  keyStage,
  yearGroup,
}: LanguageContext): string | undefined {
  const cohort = [yearGroup?.label, keyStage?.label]
    .filter((part) => part !== undefined)
    .join(", ");
  if (cohort === "") {
    return undefined;
  }
  const ages =
    keyStage === undefined ? undefined : KEY_STAGE_AGES[keyStage.id.toLowerCase()];
  return ages === undefined ? cohort : `${cohort}, aged ${ages}`;
}

function audience(context: LanguageContext): string {
  const cohort = describeCohort(context);
  const lines = [
    cohort === undefined
      ? "You are writing for pupils in an English school; the resource does not say which year group."
      : `You are writing for pupils in ${cohort}.`,
  ];

  if (context.targetReadingAge !== undefined) {
    lines.push(
      `Write for a reading age of ${context.targetReadingAge}, which is lower than the age of the class.`,
    );
  }

  return lines.join(" ");
}

/** British English, Oak's voice, and the age the writing is pitched at. */
export function languagePart(context: LanguageContext): string {
  return `LANGUAGE

${audience(context)} Every word you add must be one they can read without help; a scaffold a pupil cannot read is not a scaffold.

Use British English spelling throughout: "colour", not "color"; "practise" as a verb and "practice" as a noun.

VOICE

You are writing as the teacher, to the pupil, on the printed resource in front of them. Address the pupil directly and keep the tone plain and warm. Do not write in the pupil's own voice, do not address the teacher, and do not comment on the resource or on what you have changed.`;
}
