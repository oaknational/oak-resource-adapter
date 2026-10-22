import type { ModerationCategory, ModerationScores } from "./categories.js";

export type ModerationRequest = Readonly<{
  content: string;
  context?: Readonly<{ sessionId?: string; messageId?: string }>;
  signal?: AbortSignal;
}>;

export type ModerationFailureReason =
  | "ABORTED"
  | "INVALID_REQUEST"
  | "MALFORMED_RESPONSE"
  | "NOT_AUTHENTICATED"
  | "NOT_AUTHORISED"
  | "TIMED_OUT"
  | "UPSTREAM_UNAVAILABLE";

export type ModerationOutcome =
  | Readonly<{
      outcome: "PASSED";
      scores: ModerationScores;
      promptVersion: string;
      moderationId?: string;
    }>
  | Readonly<{
      outcome: "FLAGGED";
      flaggedCategories: readonly ModerationCategory[];
      unrecognisedCategories: readonly string[];
      scores: ModerationScores;
      promptVersion: string;
      moderationId?: string;
    }>
  | Readonly<{
      outcome: "FAILED";
      reason: ModerationFailureReason;
      cause?: unknown;
    }>;

export type Moderator = Readonly<{
  moderate: (request: ModerationRequest) => Promise<ModerationOutcome>;
}>;

export class ModerationHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ModerationHttpError";
    this.status = status;
  }
}
