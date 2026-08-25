import type { LessonKeyword } from "@oaknational/resource-adapter-curriculum";

import type {
  OakMaterialPart,
  OakMaterialValue,
  TransformationMaterial,
} from "./material";

export const lessonKeywordsPart: OakMaterialPart = {
  label: "Lesson keywords",
  read: (lesson) =>
    lesson.keywords.length === 0
      ? undefined
      : { keywords: lesson.keywords, kind: "keywords" },
  render: (value) => {
    if (value.kind !== "keywords") {
      return "";
    }

    const list = value.keywords
      .map(({ description, keyword }) => `- ${keyword}: ${description}`)
      .join("\n");

    return `These are the lesson's own keywords and Oak's definitions of them. Where you use one of these words, Oak's definition is the one to use.

${list}`;
  },
};

/** For a contribution that needs the keywords themselves, not their prompt text. */
export function lessonKeywordsFrom(
  material: TransformationMaterial,
): readonly LessonKeyword[] {
  const value: OakMaterialValue | undefined = material["lesson.keywords"];
  return value?.kind === "keywords" ? value.keywords : [];
}
