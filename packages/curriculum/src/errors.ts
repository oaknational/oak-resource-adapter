import { z } from "zod";

/**
 * - `unusable-identity`: the caller asked with a blank slug.
 * - `not-found`: Oak publishes nothing for this identity.
 * - `ambiguous-identity`: Oak publishes more than one answer and they disagree.
 * - `unavailable-resource`: the lesson publishes no such resource, or Oak holds none.
 * - `upstream-unavailable`: Oak is unreachable or refused the request.
 * - `timed-out`: Oak did not respond in time.
 * - `malformed-response`: Oak answered in a shape this package does not accept.
 */
export type CurriculumErrorCode =
  | "ambiguous-identity"
  | "malformed-response"
  | "not-found"
  | "timed-out"
  | "unavailable-resource"
  | "unusable-identity"
  | "upstream-unavailable";

export class CurriculumError extends Error {
  readonly code: CurriculumErrorCode;

  constructor(message: string, options: ErrorOptions & { code: CurriculumErrorCode }) {
    super(message, options);
    this.name = "CurriculumError";
    this.code = options.code;
  }
}

/**
 * A Zod failure means the response did not match the schema; anything else
 * unrecognised is treated as the upstream being unavailable, because a `fetch`
 * can fail in ways no runtime documents.
 */
export function toCurriculumError(error: unknown): CurriculumError {
  if (error instanceof CurriculumError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new CurriculumError("Oak answered in a shape this package cannot read.", {
      cause: error,
      code: "malformed-response",
    });
  }

  return new CurriculumError(
    error instanceof Error ? error.message : "Oak failed in an unrecognised way.",
    { cause: error, code: "upstream-unavailable" },
  );
}
