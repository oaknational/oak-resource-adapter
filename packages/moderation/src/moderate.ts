import { raLogger } from "@oaknational/resource-adapter-logger";

import { isModerationCategory } from "./categories.js";
import { DEFAULT_MODERATION_TIMEOUT_MS, type ModerationConfig } from "./config.js";
import { fetchWithTimeout } from "./fetch-with-timeout.js";
import { moderationResponseSchema } from "./response-schema.js";
import {
  ModerationHttpError,
  type ModerationFailureReason,
  type ModerationOutcome,
  type ModerationRequest,
  type Moderator,
} from "./types.js";

const log = raLogger("moderation");

type HttpAnswer = Readonly<{ status: number; ok: boolean; body: string }>;

async function readOidcToken(): Promise<string | undefined> {
  try {
    const { getVercelOidcToken } = await import("@vercel/oidc");
    return await getVercelOidcToken();
  } catch {
    return undefined;
  }
}

function requestBody({ content, context }: ModerationRequest): string {
  const wireContext = {
    ...(context?.sessionId === undefined ? {} : { session_id: context.sessionId }),
    ...(context?.messageId === undefined ? {} : { message_id: context.messageId }),
  };

  return JSON.stringify(
    Object.keys(wireContext).length === 0
      ? { content }
      : { content, context: wireContext },
  );
}

async function readAnswer(response: Response): Promise<HttpAnswer> {
  if (response.ok) {
    return { status: response.status, ok: true, body: await response.text() };
  }
  await response.body?.cancel();
  return { status: response.status, ok: false, body: "" };
}

function failed(reason: ModerationFailureReason, cause: unknown): ModerationOutcome {
  return { outcome: "FAILED", reason, cause };
}

function failedStatus(status: number): ModerationOutcome {
  switch (status) {
    case 400:
      return failed(
        "INVALID_REQUEST",
        new ModerationHttpError(
          status,
          "The moderation service rejected the request as invalid.",
        ),
      );
    case 401:
      return failed(
        "NOT_AUTHENTICATED",
        new ModerationHttpError(
          status,
          "The moderation service did not accept our identity. Check the OIDC wiring and the allowlist entry.",
        ),
      );
    case 403:
      return failed(
        "NOT_AUTHORISED",
        new ModerationHttpError(
          status,
          "The moderation service refused this project. Check the allowlist entry and the OIDC wiring.",
        ),
      );
    case 504:
      return failed(
        "TIMED_OUT",
        new ModerationHttpError(
          status,
          "The moderation service timed out before answering.",
        ),
      );
    default:
      return failed(
        "UPSTREAM_UNAVAILABLE",
        new ModerationHttpError(
          status,
          `The moderation service answered with HTTP ${status}.`,
        ),
      );
  }
}

function outcomeFromBody(body: string): ModerationOutcome {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (error) {
    return failed("MALFORMED_RESPONSE", error);
  }

  const parsed = moderationResponseSchema.safeParse(json);
  if (!parsed.success) {
    return failed("MALFORMED_RESPONSE", parsed.error);
  }

  const {
    flagged_categories: flagged,
    moderation_id: moderationId,
    prompt_version: promptVersion,
    scores,
  } = parsed.data;
  const result = {
    scores,
    promptVersion,
    ...(moderationId === undefined ? {} : { moderationId }),
  };
  const flaggedCategories = flagged.filter(isModerationCategory);
  const unrecognisedCategories = flagged.filter((code) => !isModerationCategory(code));

  return flagged.length === 0
    ? { outcome: "PASSED", ...result }
    : { outcome: "FLAGGED", flaggedCategories, unrecognisedCategories, ...result };
}

export function createModerator(config: ModerationConfig): Moderator {
  const endpoint = new URL("/v1/moderate", config.apiUrl).toString();
  const timeoutMs = config.timeoutMs ?? DEFAULT_MODERATION_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(
      `Moderation timeoutMs must be a positive whole number, got ${timeoutMs}.`,
    );
  }

  async function attempt(request: ModerationRequest): Promise<ModerationOutcome> {
    if (request.signal?.aborted === true) {
      return failed("ABORTED", request.signal.reason);
    }

    const token = await readOidcToken();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token !== undefined) {
      headers.authorization = `Bearer ${token}`;
    }
    if (config.bypassSecret !== undefined) {
      headers["x-vercel-protection-bypass"] = config.bypassSecret;
    }

    const result = await fetchWithTimeout(
      endpoint,
      { method: "POST", headers, body: requestBody(request) },
      timeoutMs,
      readAnswer,
      request.signal,
    );

    switch (result.kind) {
      case "timed-out":
        return failed(
          "TIMED_OUT",
          new Error(`The moderation service did not answer within ${timeoutMs}ms.`, {
            cause: result.error,
          }),
        );
      case "aborted":
        return failed("ABORTED", result.error);
      case "failed":
        return failed("UPSTREAM_UNAVAILABLE", result.error);
      case "completed":
        return result.value.ok
          ? outcomeFromBody(result.value.body)
          : failedStatus(result.value.status);
    }
  }

  return {
    async moderate(request) {
      const outcome = await attempt(request);
      if (outcome.outcome === "FAILED") {
        const status =
          outcome.cause instanceof ModerationHttpError
            ? outcome.cause.status
            : undefined;
        log.warn(
          "Moderation failed: %s (HTTP status %s)",
          outcome.reason,
          status ?? "none",
        );
      }
      return outcome;
    },
  };
}
