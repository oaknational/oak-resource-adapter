/**
 * - `unusable-identity`: The lesson or programme slug is blank.
 * - `not-found`: No lesson found for this identity.
 * - `upstream-unavailable`: Oak is unreachable or refused the request.
 * - `timed-out`: Oak didn't respond in time.
 * - `malformed-response`: Invalid response or missing resource URL.
 */
export type CurriculumErrorCode =
  | "malformed-response"
  | "not-found"
  | "timed-out"
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
