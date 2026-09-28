import { z } from "zod";

import type { LessonKeyword } from "@oaknational/resource-adapter-curriculum";
import type { DefinitionEntry, InlineContent } from "@oaknational/resource-document";

import { lessonKeywordsFrom } from "../../oak-material/lesson-keywords";
import type { TransformationDocuments } from "../types";
import { contributionExtensions, type ContributionContext } from "./contribution";
import { insertBeneath } from "./place";

const termSchema = z.string().trim().min(1).max(60);
const definitionSchema = z.string().trim().min(1).max(100);

/** Terms alone, for a list that names the words without defining them. */
export const termsOnlySchema = z.strictObject({
  entries: z
    .array(z.strictObject({ term: termSchema }))
    .min(1)
    .max(6),
});

export function definedTermsSchemaOf(maxEntries: number) {
  return z.strictObject({
    entries: z
      .array(z.strictObject({ definition: definitionSchema, term: termSchema }))
      .min(1)
      .max(maxEntries),
  });
}

export const definedTermsSchema = definedTermsSchemaOf(6);

export type DefinitionListSchema = typeof definedTermsSchema | typeof termsOnlySchema;

type ModelEntry = Readonly<{
  definition?: string;
  term: string;
}>;

function text(value: string): InlineContent {
  return [{ type: "text", text: value }];
}

function findKeyword(
  keywords: readonly LessonKeyword[],
  term: string,
): LessonKeyword | undefined {
  return keywords.find(
    ({ keyword }) => keyword.trim().toLowerCase() === term.trim().toLowerCase(),
  );
}

/**
 * Oak's definition of a word the lesson teaches wins over the model's, and the
 * entry records that Oak wrote it so a renderer can mark it.
 */
function toEntry(
  value: ModelEntry,
  keywords: readonly LessonKeyword[],
): DefinitionEntry {
  const keyword = findKeyword(keywords, value.term);
  const definition =
    value.definition === undefined
      ? undefined
      : (keyword?.description ?? value.definition);

  return {
    term: text(value.term),
    ...(definition === undefined ? {} : { definition: text(definition) }),
    ...(keyword === undefined ? {} : { source: "oak-lesson" as const }),
  };
}

/**
 * Places a list of terms beneath the target. Which terms, and how they are
 * introduced, is each transformation's decision; this owns the node.
 */
export function applyDefinitionList(
  context: ContributionContext,
  lead: string,
  entries: readonly ModelEntry[],
): TransformationDocuments {
  return [
    insertBeneath(
      context.document,
      {
        id: `${context.contributionId}-vocabulary`,
        type: "definitionList",
        lead: text(lead),
        entries: entries.map((entry) =>
          toEntry(entry, lessonKeywordsFrom(context.material)),
        ),
        extensions: contributionExtensions(context),
      },
      context.targetNode?.id,
    ),
  ];
}
