import { z } from "zod";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { HasuraClient } from "../../infrastructure/hasura/client.js";
import {
  DEFAULT_CURRICULUM_TIMEOUT_MS,
  type OakCurriculumConfig,
} from "../../config/oak-curriculum-config.js";
import type { Lesson, LessonRepository } from "./types.js";
import { CurriculumError } from "./errors.js";
import {
  browseRowSchema,
  contentRowSchema,
  restrictionRowSchema,
} from "./lesson-schema.js";
import { LESSON_BY_SLUG_QUERY } from "./lesson-queries.js";
import { validateLessonIdentity } from "./lesson-identity.js";

const log = raLogger("curriculum");

export class OakLessonRepository implements LessonRepository {
  constructor(
    private readonly client: HasuraClient,
    private readonly timeoutMs: number,
  ) {}

  async fetch(lessonSlug: string, programmeSlug: string): Promise<Lesson> {
    validateLessonIdentity(lessonSlug, programmeSlug);

    try {
      const rawGraphQLData = await this.client.execute({
        query: LESSON_BY_SLUG_QUERY,
        variables: {
          lessonSlug,
          browseDataWhere: {
            lesson_slug: { _eq: lessonSlug },
            programme_slug: { _eq: programmeSlug },
          },
        },
      });

      const rawResponse = z
        .object({
          data: z.object({
            browseData: z.array(z.unknown()),
            content: z.array(z.unknown()),
            restrictionLevels: z.array(z.unknown()),
          }),
        })
        .parse(rawGraphQLData);

      if (rawResponse.data.browseData.length === 0) {
        throw new CurriculumError(
          `Oak publishes no lesson "${lessonSlug}" in programme "${programmeSlug}".`,
          { code: "not-found" },
        );
      }

      const browse = browseRowSchema.parse(rawResponse.data.browseData[0]);
      const content = contentRowSchema.parse(rawResponse.data.content[0]);
      const maxRestrictions =
        rawResponse.data.restrictionLevels.length > 0
          ? restrictionRowSchema.parse(rawResponse.data.restrictionLevels[0])
          : [];

      return {
        identity: { lessonSlug, programmeSlug },
        maxRestrictions,
        ...browse,
        ...content,
      };
    } catch (error) {
      if (error instanceof CurriculumError) {
        if (error.code !== "not-found") {
          log.error(
            {
              identity: { lessonSlug, programmeSlug },
              error,
            },
            { report: true },
          );
        }
        throw error;
      }
      if (error instanceof z.ZodError) {
        const curriculumError = new CurriculumError(
          "Upstream database returned an invalid or malformed data shape.",
          { cause: error, code: "malformed-response" },
        );
        log.error(
          {
            identity: { lessonSlug, programmeSlug },
            error: curriculumError,
          },
          { report: true },
        );
        throw curriculumError;
      }

      const timedOut = error instanceof DOMException && error.name === "AbortError";
      const curriculumError = timedOut
        ? new CurriculumError(`Request timed out after ${this.timeoutMs}ms`, {
            cause: error,
            code: "timed-out",
          })
        : new CurriculumError(
            error instanceof Error
              ? error.message
              : "Unknown error from upstream database",
            { cause: error, code: "upstream-unavailable" },
          );
      log.error(
        {
          identity: { lessonSlug, programmeSlug },
          error: curriculumError,
        },
        { report: true },
      );
      throw curriculumError;
    }
  }
}

export function createOakLessonRepository(
  config: OakCurriculumConfig,
): LessonRepository {
  const timeoutMs = config.timeoutMs ?? DEFAULT_CURRICULUM_TIMEOUT_MS;
  const MAX_TIMEOUT = 2147483647; // 2^31 - 1, max value for setTimeout
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT) {
    throw new RangeError(
      `timeoutMs must be a positive integer <= ${MAX_TIMEOUT}, got ${config.timeoutMs}`,
    );
  }
  const client = new HasuraClient({ ...config, timeoutMs });
  return new OakLessonRepository(client, timeoutMs);
}
