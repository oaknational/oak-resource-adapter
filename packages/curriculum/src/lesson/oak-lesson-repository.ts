import { raLogger } from "@oaknational/resource-adapter-logger";
import { z } from "zod";

import {
  resolveOakCurriculumConfig,
  type OakCurriculumConfig,
  type ResolvedOakCurriculumConfig,
} from "../config.js";
import { CurriculumError, toCurriculumError } from "../errors.js";
import { executeHasuraQuery } from "../hasura.js";
import { lessonNotFound, validateLessonIdentity } from "./lesson-identity.js";
import { LESSON_BY_SLUG_QUERY } from "./lesson-query.js";
import {
  assetsRowSchema,
  browseRowSchema,
  contentRowSchema,
  restrictionRowSchema,
} from "./lesson-schema.js";
import type { Lesson, LessonIdentity, LessonRepository } from "./lesson.js";

const log = raLogger("curriculum");

const responseSchema = z.object({
  data: z.object({
    assets: z.array(z.unknown()),
    browseData: z.array(z.unknown()),
    content: z.array(z.unknown()),
    restrictionLevels: z.array(z.unknown()),
  }),
});

export function createOakLessonRepository(
  config: OakCurriculumConfig,
): LessonRepository {
  const resolvedConfig = resolveOakCurriculumConfig(config);

  return {
    async fetch(identity: LessonIdentity): Promise<Lesson> {
      validateLessonIdentity(identity);

      try {
        return await fetchLesson(resolvedConfig, identity);
      } catch (error) {
        const curriculumError = toCurriculumError(error);
        if (curriculumError.code !== "not-found") {
          log.error({ identity, error: curriculumError }, { report: true });
        }
        throw curriculumError;
      }
    },
  };
}

async function fetchLesson(
  config: ResolvedOakCurriculumConfig,
  identity: LessonIdentity,
): Promise<Lesson> {
  const response = responseSchema.parse(
    await executeHasuraQuery(config, {
      query: LESSON_BY_SLUG_QUERY,
      variables: {
        lessonSlug: identity.lessonSlug,
        programmeSlug: identity.programmeSlug,
      },
    }),
  );

  const placement = atMostOne(response.data.browseData, browseRowSchema, {
    identity,
    what: "placement",
  });
  if (placement === undefined) {
    throw lessonNotFound(identity);
  }

  const content = atMostOne(response.data.content, contentRowSchema, {
    identity,
    what: "lesson content",
  });
  if (content === undefined) {
    throw new CurriculumError(
      `Oak publishes lesson "${identity.lessonSlug}" in a programme but no content for it.`,
      { code: "malformed-response" },
    );
  }

  const assets = atMostOne(response.data.assets, assetsRowSchema, {
    identity,
    what: "set of resources",
  });

  const maxRestrictions =
    atMostOne(response.data.restrictionLevels, restrictionRowSchema, {
      identity,
      what: "set of restriction levels",
    }) ?? [];

  return {
    identity,
    maxRestrictions,
    resources: assets?.resources ?? [],
    ...placement,
    ...content,
  };
}

/**
 * A lesson can appear in a view more than once. Rows that agree once mapped
 * describe the same lesson; rows that disagree are an ambiguity to report
 * rather than one to resolve by picking the first.
 */
function atMostOne<Schema extends z.ZodType>(
  rows: readonly unknown[],
  schema: Schema,
  context: { identity: LessonIdentity; what: string },
): z.output<Schema> | undefined {
  const byValue = new Map<string, z.output<Schema>>();

  for (const row of rows) {
    const value = schema.parse(row) as z.output<Schema>;
    byValue.set(JSON.stringify(value), value);
  }

  if (byValue.size > 1) {
    throw new CurriculumError(
      `Oak publishes ${byValue.size} different answers for the ${context.what} of lesson "${context.identity.lessonSlug}" in programme "${context.identity.programmeSlug}".`,
      { code: "ambiguous-identity" },
    );
  }

  return byValue.values().next().value;
}
